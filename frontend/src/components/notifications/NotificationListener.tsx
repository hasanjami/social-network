"use client";

import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/contexts/websocketContext';
import { useToast } from '@/contexts/toastContext';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/authContext';

export default function NotificationListener() {
  const { lastMessage } = useWebSocket();
  const { showInfo, showSuccess } = useToast();
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const lastProcessedIdRef = useRef<number>(-1);

  useEffect(() => {
    if (!lastMessage || !user) return;

    // Check if this is a new message using the internal _messageId
    const messageId = (lastMessage as { _messageId?: number })._messageId;
    if (messageId === undefined || messageId <= lastProcessedIdRef.current) {
      return; // Skip already processed or old messages
    }
    
    lastProcessedIdRef.current = messageId;

    switch (lastMessage.type) {
      case 'follow_request':
        showInfo(
          'New Follow Request',
          `${lastMessage.fromUsername} requested to follow you. Click to view requests.`
        );
        break;

      case 'follow':
        showSuccess(
          'New Follower',
          `${lastMessage.fromUsername} started following you`
        );
        // Update follower count if provided
        if (lastMessage.followerCount !== undefined) {
          updateUser({ followers: lastMessage.followerCount as number });
        }
        break;

      case 'follow_accepted':
        showSuccess(
          'Follow Request Accepted',
          `${lastMessage.fromUsername} accepted your follow request`
        );
        // Update following count if provided
        if (lastMessage.followingCount !== undefined) {
          updateUser({ following: lastMessage.followingCount as number });
        }
        break;

      case 'follow_declined':
        showInfo(
          'Follow Request Declined',
          `${lastMessage.fromUsername} declined your follow request`
        );
        break;

      case 'unfollowed':
        showInfo(
          'Unfollowed',
          `${lastMessage.fromUsername} unfollowed you`
        );
        // Update follower count if provided
        if (lastMessage.followerCount !== undefined) {
          updateUser({ followers: lastMessage.followerCount as number });
        }
        break;

      case 'follower_count_update':
        // Silent update of follower count
        if (lastMessage.followerCount !== undefined) {
          updateUser({ followers: lastMessage.followerCount as number });
        }
        break;

      case 'group_invitation': {
        const msg =
          typeof lastMessage.message === 'string' && lastMessage.message
            ? lastMessage.message
            : 'You were invited to a group.';
        showInfo('Group invitation', msg);
        break;
      }

      case 'group_join_request': {
        const msg =
          typeof lastMessage.message === 'string' && lastMessage.message
            ? lastMessage.message
            : 'Someone requested to join your group.';
        showInfo('Group join request', msg);
        break;
      }

      default:
        break;
    }
  }, [lastMessage, showInfo, showSuccess, router, user?.id, updateUser]);

  return null; // This component doesn't render anything
}
