import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { TEMP_DIR } from '../utils/paths';

export interface EngineCapability {
  available: boolean;
  binary?: string;
  version?: string;
}

export interface EngineRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type BackendJobStatus = 'queued' | 'processing' | 'success' | 'error';

export interface BackendJob {
  id: string;
  label: string;
  status: BackendJobStatus;
  progress: number;
  message?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, BackendJob>();
const JOB_TTL_MS = 60 * 60 * 1000;

function sweepJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.updatedAt < cutoff) jobs.delete(id);
  }
}

export function createBackendJob(label: string): BackendJob {
  sweepJobs();
  const now = Date.now();
  const job: BackendJob = {
    id: crypto.randomBytes(8).toString('hex'),
    label,
    status: 'queued',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

export function updateBackendJob(id: string, patch: Partial<Pick<BackendJob, 'status' | 'progress' | 'message' | 'error'>>): BackendJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  const next = { ...job, ...patch, updatedAt: Date.now() };
  jobs.set(id, next);
  return next;
}

export function getBackendJob(id: string): BackendJob | null {
  sweepJobs();
  return jobs.get(id) || null;
}

export function listBackendJobs(): BackendJob[] {
  sweepJobs();
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function runEngineCommand(
  bin: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<EngineRunResult> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr || err.message });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export async function detectBinary(
  candidates: string[],
  versionArgs: string[],
  matcher: (stdout: string, stderr: string) => boolean,
): Promise<EngineCapability> {
  for (const bin of candidates) {
    const { code, stdout, stderr } = await runEngineCommand(bin, versionArgs, 10_000);
    if (code === 0 && matcher(stdout, stderr)) {
      return { available: true, binary: bin, version: (stdout || stderr).trim().split('\n')[0] };
    }
  }
  return { available: false };
}

export async function makeEngineWorkDir(prefix: string): Promise<string> {
  const dir = path.join(TEMP_DIR, `${prefix}-${crypto.randomBytes(6).toString('hex')}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function assertFile(pathname: string): Promise<void> {
  await fs.access(pathname);
}
