import { BoardProvider } from '@/context/BoardContext';
import KanbanBoard from '@/components/KanbanBoard';

const Index = () => {
  return (
    <BoardProvider>
      <KanbanBoard />
    </BoardProvider>
  );
};

export default Index;
