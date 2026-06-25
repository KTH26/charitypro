import React, { useEffect } from 'react';
import { useStore, applyRemoteEvent } from '../store';

export const SyncEngine: React.FC = () => {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const pollEvents = async () => {
      try {
        const lastEventId = useStore.getState().lastEventId;
        const res = await fetch(`/api/events?since=${lastEventId}`);
        const data = await res.json();
        
        if (data.success && data.events && data.events.length > 0) {
          const clientId = useStore.getState().clientId;
          let maxId = lastEventId;
          
          for (const ev of data.events) {
            if (ev.client_id !== clientId) {
              const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
              applyRemoteEvent(ev.action, payload);
            }
            if (ev.id > maxId) maxId = ev.id;
          }
          
          useStore.setState({ lastEventId: maxId });
        }
      } catch (err) {
        // Silently ignore polling errors
      }
    };

    // Initial poll
    pollEvents();
    // Poll every 3 seconds
    interval = setInterval(pollEvents, 3000);

    return () => clearInterval(interval);
  }, []);

  return null;
};
