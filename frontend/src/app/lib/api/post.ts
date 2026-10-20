import { API_BASE_URL } from './config';

export interface Post {
  id: number;
  user_id: number;
  group_id?: number;
  title: string;
  content: string;
  image?: string;
  privacy: 'public' | 'private' | 'almost_private' | 'specific';
  created_at: string;
  likeCount: number;
  isLiked: boolean;
  commentCount: number;
  author?: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    avatarUrl?: string;
  };
}

export interface CreatePostData {
  title: string;
  content: string;
  image?: File;
  privacy: string;
  group_id?: number;
  allowedUsers?: number[];
}

export interface UpdatePostData {
  title?: string;
  content?: string;
  image?: string;
  imageFile?: File;
  privacy?: string;
  allowedUsers?: number[];
}

// Create a new post
export const createPost = async (postData: CreatePostData): Promise<{ success: boolean; post?: Post; error?: string }> => {
  try {
    const form = new FormData();
    form.append('title', postData.title);
    form.append('content', postData.content);
    form.append('privacy', postData.privacy);
    if (postData.image instanceof File) {
      form.append('image', postData.image);
    }
    if (postData.allowedUsers && postData.allowedUsers.length > 0) {
      form.append('allowedUsers', postData.allowedUsers.join(','));
    }

    const response = await fetch(`${API_BASE_URL}/api/posts`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to create post' };
    }

    return { success: true, post: data.post };
  } catch (error) {
    console.error('Error creating post:', error);
    return { success: false, error: 'An error occurred while creating the post' };
  }
};

// Get a single post by ID
export const getPost = async (postId: number): Promise<{ success: boolean; post?: Post; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/posts/${postId}`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to fetch post' };
    }

    return { success: true, post: data.post };
  } catch (error) {
    console.error('Error fetching post:', error);
    return { success: false, error: 'An error occurred while fetching the post' };
  }
};

// Get posts for a specific user
export const getUserPosts = async (userId?: number): Promise<{ success: boolean; posts?: Post[]; error?: string }> => {
  try {
    const url = userId 
      ? `${API_BASE_URL}/api/posts/user?user_id=${userId}`
      : `${API_BASE_URL}/api/posts/user`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to fetch user posts' };
    }

    return { success: true, posts: data.posts || [] };
  } catch (error) {
    console.error('Error fetching user posts:', error);
    return { success: false, error: 'An error occurred while fetching user posts' };
  }
};

// Get feed posts
export const getFeedPosts = async (): Promise<{ success: boolean; posts?: Post[]; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/posts/feed`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to fetch feed' };
    }

    return { success: true, posts: data.posts || [] };
  } catch (error) {
    console.error('Error fetching feed:', error);
    return { success: false, error: 'An error occurred while fetching the feed' };
  }
};

// Update a post
export const updatePost = async (postId: number, postData: UpdatePostData): Promise<{ success: boolean; post?: Post; error?: string }> => {
  try {
    const form = new FormData();
    if (postData.title) form.append('title', postData.title);
    if (postData.content) form.append('content', postData.content);
    if (postData.privacy) form.append('privacy', postData.privacy);
    if (postData.imageFile instanceof File) form.append('image', postData.imageFile);
    if (postData.allowedUsers && postData.allowedUsers.length > 0) {
      form.append('allowedUsers', postData.allowedUsers.join(','));
    }

    const response = await fetch(`${API_BASE_URL}/api/posts?id=${postId}`, {
      method: 'PUT',
      credentials: 'include',
      body: form,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to update post' };
    }

    return { success: true, post: data.post };
  } catch (error) {
    console.error('Error updating post:', error);
    return { success: false, error: 'An error occurred while updating the post' };
  }
};

// Delete a post
export const deletePost = async (postId: number): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/posts?id=${postId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to delete post' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting post:', error);
    return { success: false, error: 'An error occurred while deleting the post' };
  }
};

export const toggleLike = async (postId: number): Promise<{ success: boolean; liked?: boolean; count?: number; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/posts/like?id=${postId}`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || 'Failed to toggle like' };
    return { success: true, liked: data.liked, count: data.count };
  } catch {
    return { success: false, error: 'An error occurred' };
  }
};

// Get allowed viewers for a private post
export const getAllowedViewers = async (postId: number): Promise<{ success: boolean; allowedUsers?: number[]; error?: string }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/posts/allowed-viewers?post_id=${postId}`, {
      method: 'GET',
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || 'Failed to fetch allowed viewers' };
    return { success: true, allowedUsers: data.allowedUsers || [] };
  } catch (error) {
    console.error('Error fetching allowed viewers:', error);
    return { success: false, error: 'An error occurred while fetching allowed viewers' };
  }
};
