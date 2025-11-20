export enum AppState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  GENERATING_IMAGE = 'GENERATING_IMAGE',
  REFINING_PROMPT = 'REFINING_PROMPT',
  SPEAKING = 'SPEAKING'
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  createdAt: number;
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
}

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';