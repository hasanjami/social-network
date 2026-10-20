import { API_BASE_URL } from './config';

export interface Comment {
  id: number;
  postId: number;
  userId: number;
  content: string;
  image?: string;
  createdAt: string;
  author?: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    avatarUrl?: string;
  };
}

export interface CreateCommentData {
  postId: number;
  content: string;
  image?: File;
}

// Create a new comment
export const createComment = async (commentData: CreateCommentData): Promise<{ success: boolean; comment?: Comment; error?: string }> => {
  try {
    const form = new FormData();
    form.append('postId', String(commentData.postId));
    form.append('content', commentData.content);
    if (commentData.image instanceof File) {
      form.append('image', commentData.image);
    }

    const response = await fetch(`${API_BASE_URL}/api/comments`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to create comment' };
    }

    return { success: true, comment: data.comment };
  } catch (error) {
    console.error('Error creating comment:', error);
    return { success: false, error: 'An error occurred while creating the comment' };
  }
};

// Get comments for a post
export const getComments = async (postId: number): Promise<{ success: boolean; comments?: Comment[]; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/comments?post_id=${postId}`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to fetch comments' };
    }

    const comments: Comment[] = (data.comments || []).map((c: Comment) => {
      if (c.author?.avatar && !c.author.avatarUrl) {
        c.author.avatarUrl = c.author.avatar.startsWith('http')
          ? c.author.avatar
          : `${API_BASE_URL}${c.author.avatar}`;
      }
      return c;
    });
    return { success: true, comments };
  } catch (error) {
    console.error('Error fetching comments:', error);
    return { success: false, error: 'An error occurred while fetching comments' };
  }
};

// Delete a comment
export const deleteComment = async (commentId: number): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/comments?id=${commentId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to delete comment' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting comment:', error);
    return { success: false, error: 'An error occurred while deleting the comment' };
  }
};
