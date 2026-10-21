import {chatStream, headers} from './transport.js';
export interface Message {role: 'user' | 'assistant'; content: string}
export type Question = {type: 'choice'; instructions: string; criteria: Record<string,string>} | {type: 'score'; instructions: string; criteria: string[]} | {type: 'noul'; instructions: string; criteria?: Record<string,string>};
export class QuantAIClient {
  private baseUrl: string;
  constructor(baseUrl: string, private token: string) {this.baseUrl = baseUrl.replace(/\/$/, '');}
  private async request(path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(this.baseUrl + path, {method: body === undefined ? 'GET' : 'POST', headers: headers(this.token), ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    return response.json();
  }
  health() {return this.request('/api/health');}
  chat(messages: Message[], onContent: (text: string) => void, signal = new AbortController().signal) {
    return chatStream(this.baseUrl, this.token, {model: 'qwen2.5:7b', messages}, signal, onContent);
  }
  decide(state: string, questions: Record<string,Question>) {return this.request('/api/decision', {model: 'multilingual', state, questions});}
}
