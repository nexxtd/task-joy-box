import { CanvasItem, Connection } from '@/components/Whiteboard';

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