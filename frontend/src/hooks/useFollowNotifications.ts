"use client";

import { useEffect,useRef } from 'react';
import { useWebSocket } from '@/contexts/websocketContext';

interface FollowNotificationCallbacks {
  onFollowRequest?: (data: { fromUserId: number; fromUsername: string; message: string; followerCount?: number }) => void;
  onNewFollower?: (data: { fromUserId: number; fromUsername: string; message: string; followerCount?: number }) => void;
  onFollowAccepted?: (data: { fromUserId: number; fromUsername: string; message: string; followingCount?: number }) => void;
  onFollowDeclined?: (data: { fromUserId: number; fromUsername: string }) => void;
  onUnfollowed?: (data: { fromUserId: number; fromUsername: string; followerCount?: number }) => void;
}

export function useFollowNotifications(callbacks: FollowNotificationCallbacks) {
  const { lastMessage } = useWebSocket();
  const callbacksRef = useRef(callbacks);

  // Update ref when callbacks change
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    if (!lastMessage) return;

    // Get current callbacks from ref
    const currentCallbacks = callbacksRef.current;

    switch (lastMessage.type) {
      case 'follow_request':
        currentCallbacks.onFollowRequest?.({
          fromUserId: lastMessage.fromUserId!,
          fromUsername: lastMessage.fromUsername!,
          message: lastMessage.message!,
          followerCount: lastMessage.followerCount as number | undefined,
        });
        break;

      case 'follow':
        currentCallbacks.onNewFollower?.({
          fromUserId: lastMessage.fromUserId!,
          fromUsername: lastMessage.fromUsername!,
          message: lastMessage.message!,
          followerCount: lastMessage.followerCount as number | undefined,
        });
        break;

      case 'follow_accepted':
        currentCallbacks.onFollowAccepted?.({
          fromUserId: lastMessage.fromUserId!,
          fromUsername: lastMessage.fromUsername!,
          message: lastMessage.message!,
          followingCount: lastMessage.followingCount as number | undefined,
        });
        break;

      case 'follow_declined':
        currentCallbacks.onFollowDeclined?.({
          fromUserId: lastMessage.fromUserId!,
          fromUsername: lastMessage.fromUsername!,
        });
        break;

      case 'unfollowed':
        currentCallbacks.onUnfollowed?.({
          fromUserId: lastMessage.fromUserId!,
          fromUsername: lastMessage.fromUsername!,
          followerCount: lastMessage.followerCount as number | undefined,
        });
        break;
    }
  }, [lastMessage]); // Only depend on lastMessage
}