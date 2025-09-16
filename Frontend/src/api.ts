// api.ts
import axios, { AxiosResponse } from 'axios';

// Base URL for the API
const API_BASE_URL = 'http://localhost:8000'; // Adjust based on your server configuration

// Interface for the response from the /start-agents endpoint
interface StartAgentsResponse {
  status: string;
}

// Interface for WebSocket messages (based on the broadcast messages in main.py)
interface WebSocketMessage {
  agent: "ErrorAnalyzer" | "FixerAgent" | "MonitorAgent" | "LogForwarder";
  status: "error detected" | "analysis complete" | "remediation applied" | "logs forwarded";
  time: string;
  details: string;
  reference: string;
}

// Function to validate WebSocket message
const isValidWebSocketMessage = (data: any): data is WebSocketMessage => {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.agent === 'string' &&
    typeof data.status === 'string' &&
    typeof data.time === 'string' &&
    typeof data.details === 'string' &&
    typeof data.reference === 'string'
  );
};

// Function to call the /start-agents endpoint
export async function startAgents(): Promise<StartAgentsResponse> {
  try {
    const response: AxiosResponse<StartAgentsResponse> = await axios.get(`${API_BASE_URL}/start-agents`);
    return response.data;
  } catch (error) {
    console.error('Error starting agents:', error);
    throw new Error('Failed to start agents');
  }
}

// Function to establish WebSocket connection
export function connectWebSocket(onMessage: (message: WebSocketMessage) => void, onError?: (error: Event) => void): WebSocket {
  const ws = new WebSocket('ws://localhost:8000/ws'); // Adjust based on your server configuration

  ws.onmessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      if (isValidWebSocketMessage(message)) {
        onMessage(message);
      } else {
        console.error('Invalid WebSocket message structure:', message);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error, 'Raw data:', event.data);
    }
  };

  ws.onerror = (error: Event) => {
    console.error('WebSocket error:', error);
    if (onError) onError(error);
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
  };

  return ws;
}