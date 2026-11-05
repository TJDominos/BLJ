export interface CommentItem {
  id: number;
  user: string;
  avatar: string;
  date: string;
  content: string;
  replies: number;
  verified: boolean;
}

const liveCommentsStore: CommentItem[] = [];

export const mockBackendGetRecentComments = async (count: number): Promise<CommentItem[]> => {
  return liveCommentsStore.slice(-count);
};

export const mockBackendGetCommentsSince = async (lastId: number): Promise<CommentItem[]> => {
  return liveCommentsStore.filter(c => c.id > lastId);
};
