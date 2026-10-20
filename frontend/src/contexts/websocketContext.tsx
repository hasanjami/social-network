"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from './authContext';

interface WebSocketMessage {
  type: string;
  fromUserId?: number;
  fromUsername?: string;
  message?: string;
  timestamp?: string;
  [key: string]: unknown;
}

interface WebSocketContextType {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: Record<string, unknown>) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const messageIdRef = useRef<number>(0); // Track message sequence

  useEffect(() => {
    if (!user) {
      // Disconnect if user logs out
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      // State cleanup will happen in the cleanup function
      return;
    }

    // Don't reconnect if already connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const connect = () => {
      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Don't create a new connection if one already exists and is connecting/open
      if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
        return;
      }

      try {
        const ws = new WebSocket('ws://localhost:8080/ws');
        
        ws.onopen = () => {
          setIsConnected(true);
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            
            // Add a unique message ID to help track which messages have been processed
            messageIdRef.current += 1;
            const messageWithId = { ...data, _messageId: messageIdRef.current };
            
            setLastMessage(messageWithId);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          wsRef.current = null;
          
          // Only reconnect if user is still logged in and it wasn't a normal closure
          if (user && event.code !== 1000) {
            const delay = Math.min(3000 * Math.pow(1.5, reconnectAttemptRef.current), 30000);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptRef.current++;
              connect();
            }, delay);
          }
        };

        wsRef.current = ws;
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      // Clean up state in the cleanup function
      setIsConnected(false);
      setLastMessage(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reconnect when user ID changes, not the entire user object

  const sendMessage = (message: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}