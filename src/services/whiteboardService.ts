// Define types locally to avoid import issues
export interface CanvasItem {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  color?: string;
  rotation?: number;
  fontSize?: number;
  borderColor?: string;
  backgroundColor?: string;
  connections?: ConnectionPoint[];
  title?: string;
  description?: string; // For sticky notes, text blocks, documents, comments
  tasks?: Array<{ id: string; text: string; completed: boolean; taskType?: string }>;
  taskIds?: string[]; // For live sync with app tasks
  imageUrl?: string; // For images
  images?: Array<{ id: string; url: string; description?: string }>; // Multiple images
  fileUrl?: string; // For file attachments
  // New properties for enhanced blocks
  locked?: boolean;
  zIndex?: number;
  // Text block specific
  textType?: 'header-only' | 'description-only' | 'header-description';
  // Shape specific
  shapeType?: 'square' | 'circle' | 'star' | 'triangle' | 'diamond' | 'hexagon' | 'arrow';
  fillColor?: string;
  borderThickness?: 'thin' | 'medium' | 'thick';
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  opacity?: number;
  cornerRadius?: number;
  // Table specific
  rows?: number;
  columns?: number;
  cells?: Array<{ row: number; column: number; content: string; formatting?: Array<'bold' | 'underline' | 'bullet'> }>;
  // Link specific
  url?: string;
  // Connection line specific
  lineColor?: string;
  lineThickness?: 'thin' | 'medium' | 'thick';
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
  type: 'straight' | 'curved' | 'elbow' | 'dotted';
  color?: string;
  thickness?: 'thin' | 'medium' | 'thick';
}

interface ConnectionPoint {
  id: string;
  itemId: string;
  x: number;
  y: number;
  connected: boolean;
}

export interface WhiteboardData {
  id: number;
  userId: number;
  name: string;
  description?: string;
  items: CanvasItem[];
  connections: Connection[];
  createdAt: string;
  updatedAt: string;
}

export interface WhiteboardRequest {
  name: string;
  description?: string;
  items: CanvasItem[];
  connections: Connection[];
}

// Get all whiteboards for the current user
export const getWhiteboards = async (): Promise<WhiteboardData[]> => {
  const response = await fetch('/api/whiteboards');

  if (!response.ok) {
    throw new Error(`Failed to fetch whiteboards: ${response.statusText}`);
  }

  return response.json();
};

// Create a new whiteboard
export const createWhiteboard = async (whiteboardData: WhiteboardRequest): Promise<WhiteboardData> => {
  const response = await fetch('/api/whiteboards', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(whiteboardData),
  });

  if (!response.ok) {
    throw new Error(`Failed to create whiteboard: ${response.statusText}`);
  }

  return response.json();
};

// Get a specific whiteboard by ID
export const getWhiteboardById = async (id: number): Promise<WhiteboardData> => {
  const response = await fetch(`/api/whiteboards/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch whiteboard: ${response.statusText}`);
  }

  return response.json();
};

// Update a whiteboard
export const updateWhiteboard = async (id: number, whiteboardData: WhiteboardRequest): Promise<WhiteboardData> => {
  const response = await fetch(`/api/whiteboards/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(whiteboardData),
  });

  if (!response.ok) {
    throw new Error(`Failed to update whiteboard: ${response.statusText}`);
  }

  return response.json();
};

// Delete a whiteboard
export const deleteWhiteboard = async (id: number): Promise<void> => {
  const response = await fetch(`/api/whiteboards/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete whiteboard: ${response.statusText}`);
  }
};