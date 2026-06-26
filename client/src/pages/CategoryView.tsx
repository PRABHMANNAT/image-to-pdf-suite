import { useParams, Navigate } from 'react-router-dom';
import { CATEGORIES, CategoryId, toolsByCategory } from '../lib/tools';
import { CategorySection } from '../components/dashboard/CategorySection';

export default function CategoryView() {
  const { id } = useParams<{ id: string }>();
  const cat = CATEGORIES.find((c) => c.id === id);
  if (!cat) return <Navigate to="/" replace />;
  return (
    <div className="max-w-7xl mx-auto">
      <CategorySection category={cat} tools={toolsByCategory(cat.id as CategoryId)} />
    </div>
  );
}
