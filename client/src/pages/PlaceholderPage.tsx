import { Navigate, useParams } from 'react-router-dom';
import { findTool } from '../lib/tools';
import { ToolPlaceholder } from '../components/ToolPlaceholder';

// Single component handling every "coming soon" tool route via a :toolId param.
export default function PlaceholderPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const tool = toolId ? findTool(toolId) : undefined;
  if (!tool) return <Navigate to="/" replace />;
  return <ToolPlaceholder tool={tool} />;
}
