export const mockBackendGetRecentComments = async (count: number) => {
  return [
    {
      id: 1,
      user: 'Randseed',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Randseed',
      date: '2025/07/19',
      content: 'Chat about anything and everything...',
      replies: 1,
      verified: false
    },
    {
      id: 2,
      user: 'Dcandra989',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Dcandra989',
      date: '2025/12/01',
      content: 'P',
      replies: 1,
      verified: true
    },
    {
      id: 3,
      user: 'Dcandra9892',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Dcandra9892',
      date: '2025/12/01',
      content: 'P',
      replies: 0,
      verified: true
    },
    {
      id: 4,
      user: 'Pragya',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Pragya',
      date: '2025/11/12',
      content: 'Y',
      replies: 1,
      verified: true
    },
    {
      id: 5,
      user: 'John',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
      date: '2025/10/29',
      content: 'To the management of Randseed, please add to the daily bonus,is too small 🙏',
      replies: 1,
      verified: true
    }
  ].reverse().slice(0, count);
};

export const mockBackendGetCommentsSince = async (lastId: number) => {
  if (Math.random() < 0.3) {
    return [
      {
        id: lastId + 1,
        user: `User${Math.floor(Math.random() * 1000)}`,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=User${Math.floor(Math.random() * 1000)}`,
        date: new Date().toLocaleDateString(),
        content: `Good luck everyone! ${Math.floor(Math.random() * 100)}`,
        replies: 0,
        verified: false
      }
    ];
  }
  return [];
};
