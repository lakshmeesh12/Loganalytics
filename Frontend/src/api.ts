import axios, { AxiosResponse } from 'axios';

// Base URL for the API
const API_BASE_URL = 'http://localhost:8000';

// Interface for the response from the /start-agents and /stop-agents endpoints
interface AgentResponse {
  status: string;
}

// Interface for LiveConsole log messages
interface LogMessage {
  id?: string;
  timestamp: string;
  level: string;
  agent: string;
  message: string;
  source?: string;
  [key: string]: any;
}

// Interface for AgentActions messages
interface AgentActionMessage {
  reference: string;
  status: string;
  details?: string;
  agent: 'ErrorAnalyzer' | 'FixerAgent' | 'WindowsMonitor' | 'SnowflakeMonitor' | 'KubernetesMonitor' | 'DatabricksMonitor' | 'EmailAgent';
  time?: string;
  timestamp?: string;
  [key: string]: any;
}

// Function to validate log messages for LiveConsole
const isValidLogMessage = (data: any): data is LogMessage => {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.timestamp === 'string' &&
    typeof data.level === 'string' &&
    typeof data.agent === 'string' &&
    typeof data.message === 'string'
  );
};

// Function to validate action messages for AgentActions
const isValidAgentActionMessage = (data: any): data is AgentActionMessage => {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.reference === 'string' &&
    typeof data.status === 'string' &&
    typeof data.agent === 'string' &&
    ['ErrorAnalyzer', 'FixerAgent', 'WindowsMonitor', 'SnowflakeMonitor', 'KubernetesMonitor', 'DatabricksMonitor', 'EmailAgent'].includes(data.agent)
  );
};

// Function to call the /start-agents endpoint with mode parameter
export async function startAgents(mode: 'semi-autonomous' | 'autonomous' = 'semi-autonomous'): Promise<AgentResponse> {
  try {
    const response: AxiosResponse<AgentResponse> = await axios.get(`${API_BASE_URL}/start-agents`, {
      params: { mode }
    });
    return response.data;
  } catch (error) {
    console.error('Error starting agents:', error);
    throw new Error(`Failed to start agents in ${mode} mode`);
  }
}

// Function to call the /stop-agents endpoint
export async function stopAgents(): Promise<AgentResponse> {
  try {
    const response: AxiosResponse<AgentResponse> = await axios.get(`${API_BASE_URL}/stop-agents`);
    return response.data;
  } catch (error) {
    console.error('Error stopping agents:', error);
    throw new Error('Failed to stop agents');
  }
}

// Function to establish WebSocket connection for LiveConsole
export function connectWebSocket(
  onMessage: (message: LogMessage) => void,
  onError?: (error: Event) => void
): WebSocket {
  const ws = new WebSocket('ws://localhost:8000/ws');

  ws.onmessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'ping') {
        ws.send('pong');
        return;
      }
      if (isValidLogMessage(message)) {
        console.log('Received valid log message:', message);
        onMessage(message);
      } else {
        console.error('Invalid log message structure:', message);
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

// Function to establish WebSocket connection for AgentActions
export function connectAgentActionsWebSocket(
  onMessage: (message: AgentActionMessage) => void,
  onError?: (error: Event) => void
): WebSocket {
  const ws = new WebSocket('ws://localhost:8000/ws');

  ws.onmessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'ping') {
        ws.send('pong');
        return;
      }
      if (isValidAgentActionMessage(message)) {
        console.log('Received valid action message:', message);
        onMessage(message);
      } else {
        console.log('Ignoring non-action message:', message);
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


export interface Rule {
  id: string;
  name: string;
  type: 'Predefined' | 'Custom';
  data_source: 'snowflake' | 'eks' | 'windows' | 'linux' | 'macos';
  condition: string;
  action: string;
  status: 'Active' | 'Inactive';
  priority: 'Low' | 'Medium' | 'High';
  notification?: 'Email' | 'Slack' | 'Both';
  real_time: boolean;
  last_triggered?: string;
  created_at: string;
  updated_at: string;
}

export interface PredefinedRule {
  id: string;
  name: string;
  data_source: 'snowflake' | 'eks' | 'windows' | 'linux' | 'macos';
  condition: string;
  action: string;
  priority: 'Low' | 'Medium' | 'High';
  description?: string;
}

export interface CreateRuleRequest {
  name: string;
  type: 'Predefined' | 'Custom';
  data_source: 'snowflake' | 'eks' | 'windows' | 'linux' | 'macos';
  condition: string;
  action: string;
  priority?: 'Low' | 'Medium' | 'High';
  notification?: 'Email' | 'Slack' | 'Both';
  real_time?: boolean;
}

export interface UpdateRuleRequest {
  name?: string;
  condition?: string;
  action?: string;
  status?: 'Active' | 'Inactive';
  priority?: 'Low' | 'Medium' | 'High';
  notification?: 'Email' | 'Slack' | 'Both';
  real_time?: boolean;
}

export interface NLPParseRequest {
  text: string;
}

export interface NLPParseResponse {
  data_source: 'snowflake' | 'eks' | 'windows' | 'linux' | 'macos';
  condition: string;
  action: string;
  priority: 'Low' | 'Medium' | 'High';
  notification: 'Email' | 'Slack' | 'Both';
}

export interface RulesStats {
  data_source: string;
  total: number;
  active: number;
  inactive: number;
}

class RulesApiService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8000/api') {
    this.baseUrl = baseUrl;
  }

  private async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, defaultOptions);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  // Rules CRUD Operations
  
  async getRules(filters?: {
    data_source?: string;
    status?: string;
    type?: string;
    search?: string;
  }): Promise<Rule[]> {
    const searchParams = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) searchParams.append(key, value);
      });
    }

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.fetchApi<Rule[]>(`/rules${query}`);
  }

  async getRule(id: string): Promise<Rule> {
    return this.fetchApi<Rule>(`/rules/${id}`);
  }

  async createRule(rule: CreateRuleRequest): Promise<Rule> {
    return this.fetchApi<Rule>('/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  }

  async updateRule(id: string, updates: UpdateRuleRequest): Promise<Rule> {
    return this.fetchApi<Rule>(`/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteRule(id: string): Promise<{ message: string }> {
    return this.fetchApi<{ message: string }>(`/rules/${id}`, {
      method: 'DELETE',
    });
  }

  async toggleRuleStatus(id: string): Promise<Rule> {
    return this.fetchApi<Rule>(`/rules/${id}/toggle`, {
      method: 'PATCH',
    });
  }

  // Predefined Rules Operations

  async getPredefinedRules(dataSource?: string): Promise<PredefinedRule[]> {
    const query = dataSource ? `?data_source=${dataSource}` : '';
    return this.fetchApi<PredefinedRule[]>(`/predefined-rules${query}`);
  }

  async activatePredefinedRule(predefinedRuleId: string): Promise<Rule> {
    return this.fetchApi<Rule>(`/predefined-rules/${predefinedRuleId}/activate`, {
      method: 'POST',
    });
  }

  // NLP Operations

  async parseNLPRule(text: string): Promise<NLPParseResponse> {
    return this.fetchApi<NLPParseResponse>('/parse-nlp', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  // Statistics

  async getRulesStatsBySource(): Promise<RulesStats[]> {
    return this.fetchApi<RulesStats[]>('/stats/rules-by-source');
  }

  // Health Check

  async healthCheck(): Promise<{ status: string; database: string }> {
    return this.fetchApi<{ status: string; database: string }>('/health');
  }
}

// Create a singleton instance
export const rulesApi = new RulesApiService();

// Export for custom base URL
export { RulesApiService };