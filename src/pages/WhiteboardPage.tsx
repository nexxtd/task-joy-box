import { useParams } from 'react-router-dom';
import Whiteboard from '@/components/Whiteboard';

const WhiteboardPage = () => {
  const { id } = useParams<{ id: string }>();
  const whiteboardId = id ? parseInt(id) : undefined;

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Whiteboard whiteboardId={whiteboardId} />
    </div>
  );
};

export default WhiteboardPage;
