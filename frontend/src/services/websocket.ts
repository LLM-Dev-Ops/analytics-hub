/**
 * WebSocket Service
 * Real-time data streaming with automatic reconnection and buffering
 */

import { io, Socket } from 'socket.io-client';
import {
  WebSocketMessage,
  WebSocketMessageType,
  SubscriptionRequest,
  UpdateMessage,
} from '@/types/api';

export interface WebSocketConfig {
  url: string;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
  autoConnect?: boolean;
}

export type MessageHandler<T = unknown> = (message: WebSocketMessage<T>) => void;
export type UpdateHandler<T = unknown> = (update: UpdateMessage<T>) => void;
export type ErrorHandler = (error: Error) => void;
export type ConnectionHandler = () => void;

class WebSocketService {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private updateHandlers: Map<string, Set<UpdateHandler>> = new Map();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private disconnectionHandlers: Set<ConnectionHandler> = new Set();
  private subscriptions: Set<string> = new Set();
  private messageBuffer: WebSocketMessage[] = [];
  private maxBufferSize = 1000;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
      timeout: 30000,
      autoConnect: true,
      ...config,
    };

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  connect(): void {
    if (this.socket?.connected) {
      console.warn('WebSocket already connected');
      return;
    }

    this.socket = io(this.config.url, {
      reconnection: true,
      reconnectionAttempts: this.config.reconnectionAttempts,
      reconnectionDelay: this.config.reconnectionDelay,
      timeout: this.config.timeout,
    });

    this.setupEventHandlers();
  }

  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.subscriptions.clear();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.connectionHandlers.forEach((handler) => handler());
      this.resubscribeAll();
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;
      this.disconnectionHandlers.forEach((handler) => handler());
      this.stopHeartbeat();

      if (reason === 'io server disconnect') {
        // Server initiated disconnect, attempt reconnect
        this.socket?.connect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.errorHandlers.forEach((handler) => handler(error));
    });

    this.socket.on('message', (message: WebSocketMessage) => {
      this.handleMessage(message);
    });

    this.socket.on('update', (update: UpdateMessage<unknown>) => {
      this.handleUpdate(update);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`WebSocket reconnected after ${attemptNumber} attempts`);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('WebSocket reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('WebSocket reconnection failed');
      this.errorHandlers.forEach((handler) =>
        handler(new Error('WebSocket reconnection failed'))
      );
    });
  }

  private handleMessage(message: WebSocketMessage): void {
    // Buffer message if needed
    if (this.messageBuffer.length >= this.maxBufferSize) {
      this.messageBuffer.shift();
    }
    this.messageBuffer.push(message);

    // Call handlers by message type
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }

    // Call global handlers
    const globalHandlers = this.messageHandlers.get('*');
    if (globalHandlers) {
      globalHandlers.forEach((handler) => handler(message));
    }
  }

  private handleUpdate(update: UpdateMessage<unknown>): void {
    const handlers = this.updateHandlers.get(update.channel);
    if (handlers) {
      handlers.forEach((handler) => handler(update));
    }

    // Call global update handlers
    const globalHandlers = this.updateHandlers.get('*');
    if (globalHandlers) {
      globalHandlers.forEach((handler) => handler(update));
    }
  }

  subscribe(channels: string[], filters?: Record<string, unknown>): void {
    if (!this.socket?.connected) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return;
    }

    const request: SubscriptionRequest = { channels, filters };
    this.socket.emit('subscribe', request);

    channels.forEach((channel) => this.subscriptions.add(channel));
  }

  unsubscribe(channels: string[]): void {
    if (!this.socket?.connected) {
      console.warn('Cannot unsubscribe: WebSocket not connected');
      return;
    }

    this.socket.emit('unsubscribe', { channels });
    channels.forEach((channel) => this.subscriptions.delete(channel));
  }

  private resubscribeAll(): void {
    if (this.subscriptions.size > 0) {
      this.subscribe(Array.from(this.subscriptions));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat', { timestamp: Date.now() });
      }
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  onMessage(type: WebSocketMessageType | '*', handler: MessageHandler): () => void {
    const typeKey = type === '*' ? '*' : type;
    if (!this.messageHandlers.has(typeKey)) {
      this.messageHandlers.set(typeKey, new Set());
    }
    this.messageHandlers.get(typeKey)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.get(typeKey)?.delete(handler);
    };
  }

  onUpdate(channel: string | '*', handler: UpdateHandler): () => void {
    if (!this.updateHandlers.has(channel)) {
      this.updateHandlers.set(channel, new Set());
    }
    this.updateHandlers.get(channel)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.updateHandlers.get(channel)?.delete(handler);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    return () => {
      this.disconnectionHandlers.delete(handler);
    };
  }

  send<T = unknown>(type: string, data: T): void {
    if (!this.socket?.connected) {
      console.warn('Cannot send message: WebSocket not connected');
      return;
    }

    const message: WebSocketMessage<T> = {
      type: type as WebSocketMessageType,
      data,
      timestamp: new Date().toISOString(),
    };

    this.socket.emit('message', message);
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  getMessageBuffer(): WebSocketMessage[] {
    return [...this.messageBuffer];
  }

  clearMessageBuffer(): void {
    this.messageBuffer = [];
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

// Singleton instance
let wsInstance: WebSocketService | null = null;

export function initWebSocket(config: WebSocketConfig): WebSocketService {
  if (!wsInstance) {
    wsInstance = new WebSocketService(config);
  }
  return wsInstance;
}

export function getWebSocket(): WebSocketService | null {
  return wsInstance;
}

export function destroyWebSocket(): void {
  if (wsInstance) {
    wsInstance.disconnect();
    wsInstance = null;
  }
}

export default WebSocketService;
