import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';

import { mockBackendGetRecentComments, mockBackendGetCommentsSince } from '@/mockBackend';

export const FloatingCommentsOverlay = ({ show, onClick, targetId = 'floating-comments-root' }: { show: boolean, onClick?: () => void, targetId?: string }) => {
  const [activeComments, setActiveComments] = useState<any[]>([]);
  const [targetNode, setTargetNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // We get the target node where we want to portal the comments.
    // If it doesn't exist, we fall back to document body or relative container.
    const node = document.getElementById(targetId);
    if (node) {
      setTargetNode(node);
    } else {
      // Fallback if target is missing
      const dummyNode = document.createElement('div');
      dummyNode.className = "absolute top-[10%] left-0 right-0 pointer-events-none z-40 flex flex-col gap-1.5 justify-start items-start overflow-visible";
      document.body.appendChild(dummyNode);
      setTargetNode(dummyNode);
    }
    
    return () => {
      if (!node && targetNode?.parentElement) {
        targetNode.parentElement.removeChild(targetNode);
      }
    };
  }, [targetId]);

  useEffect(() => {
    if (!show) {
      setActiveComments([]);
      return;
    }

    let timeouts: NodeJS.Timeout[] = [];
    let isMounted = true;
    let lastSeenId = 0;
    
    // Helper to safely add and then automatically remove a comment
    const addComment = (comment: any) => {
      if (!isMounted) return;
      const uniqueComment = { 
        ...comment, 
        uniqueId: comment.uniqueId || Date.now() + Math.random() 
      };
      
      setActiveComments(prev => {
        const next = [uniqueComment, ...prev];
        return next.slice(0, 6); // Rule: Keep max 6 on screen at a time, add to top
      });
      
      // Rule: Display the new comments for 5 seconds
      const removeTimer = setTimeout(() => {
        if (!isMounted) return;
        setActiveComments(prev => prev.filter(c => c.uniqueId !== uniqueComment.uniqueId));
      }, 5000);
      timeouts.push(removeTimer);
    };

    // Rule 1: When a new user enters the game, display the most recent 6 comments in order.
    const init = async () => {
      try {
        const initialComments = await mockBackendGetRecentComments(6);
        if (initialComments.length > 0) {
          lastSeenId = Math.max(...initialComments.map((c: any) => c.id));
        }

        // We slice the 6 mock comments and stagger their entrance so they fly in sequentially.
        initialComments.forEach((comment: any, index: number) => {
          // Stagger them by 800ms
          const t = setTimeout(() => {
            addComment(comment);
          }, index * 800); 
          timeouts.push(t);
        });
      } catch (err) {
        console.error("Failed to fetch initial comments", err);
      }
    };
    init();

    // Rule 2 & 3: How often to check for new comments? -> Every 3 seconds
    // If no new comments arrive, we do nothing. The screen will clear.
    // If new comments arrive, display them.
    const pollInterval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const newComments = await mockBackendGetCommentsSince(lastSeenId);
        
        if (newComments.length > 0) {
          lastSeenId = Math.max(...newComments.map((c: any) => c.id));
          newComments.forEach((comment: any, index: number) => {
            const t = setTimeout(() => {
               addComment(comment);
            }, index * 400); // slight stagger if multiple come in at once
            timeouts.push(t);
          });
        }
      } catch (err) {
        console.error("Failed to poll comments", err);
      }
    }, 3000);

    return () => {
      isMounted = false;
      timeouts.forEach(clearTimeout);
      clearInterval(pollInterval);
    };
  }, [show]);

  if (!show || !targetNode || activeComments.length === 0) return null;

  return createPortal(
    <AnimatePresence mode="popLayout">
      {activeComments.map(comment => (
        <motion.div
          key={comment.uniqueId}
          layout
          initial={{ opacity: 0, x: -20, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.9 }}
          transition={{ duration: 0.4 }}
          onClick={onClick}
          className="bg-black/40 rounded-full pr-4 pl-1 py-1 flex items-center gap-2 max-w-[95%] pointer-events-auto cursor-pointer drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] transition-colors border border-white/10"
        >
          <img src={comment.avatar} className="w-6 h-6 rounded-full shrink-0 bg-zinc-800" alt={comment.user} />
          <div className="flex flex-col overflow-hidden">
            <span className="text-[9px] font-bold text-yellow-400 leading-none">{comment.user}</span>
            <span className="text-xs text-white truncate leading-tight">{comment.content}</span>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>,
    targetNode
  );
};
