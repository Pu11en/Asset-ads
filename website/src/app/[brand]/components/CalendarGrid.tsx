'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

type ScheduledPost = {
  id: string;
  blotato_id: string;
  ad_ids: string[];
  caption: string;
  hashtags: string;
  scheduled_at: string;
  slot: '9am' | '5pm';
  platform: string;
  status: string;
};

type Ad = {
  id: string;
  filename: string;
  path: string;
  product_name?: string;
};

type Props = {
  brand: string;
  brandColor: string;
  timeSlots: { label: string; hour: number; color: string }[];
};

export function CalendarGrid({ brand, brandColor, timeSlots }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  useEffect(() => {
    fetch(`/api/scheduled/${brand}`)
      .then(r => r.json())
      .then(d => {
        setPosts(d.posts ?? []);
        setLoading(false);
      });
  }, [brand]);

  // Group posts by date (YYYY-MM-DD)
  const postsByDate: Record<string, ScheduledPost[]> = {};
  for (const post of posts) {
    const date = post.scheduled_at.split('T')[0];
    if (!postsByDate[date]) postsByDate[date] = [];
    postsByDate[date].push(post);
  }

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  return (
    <div className="mb-10">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={prevMonth}
          className="w-9 h-9 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition"
        >
          ←
        </button>
        <h2 className="text-2xl font-bold tracking-tight" suppressHydrationWarning>
          {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h2>
        <button
          onClick={nextMonth}
          className="w-9 h-9 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition"
        >
          →
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-white/40 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayPosts = postsByDate[dateStr] ?? [];
          const isExpanded = expandedDay === dateStr;
          const isToday = dateStr === new Date().toISOString().split('T')[0];

          return (
            <div key={day}>
              <button
                onClick={() => setExpandedDay(isExpanded ? null : dateStr)}
                className={`w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-sm relative transition border ${
                  isToday
                    ? 'border-white/30 bg-white/5'
                    : dayPosts.length > 0
                    ? 'border-white/20 bg-white/5 hover:bg-white/10'
                    : 'border-transparent hover:border-white/10 hover:bg-white/5'
                }`}
              >
                <span className={isToday ? `font-bold` : ''}>{day}</span>
                {dayPosts.length > 0 && (
                  <div className="flex gap-1">
                    {dayPosts.map((post, idx) => (
                      <div
                        key={idx}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: post.slot === '9am' ? '#f97316' : '#3b82f6' }}
                      />
                    ))}
                  </div>
                )}
              </button>

              {/* Expanded day panel */}
              {isExpanded && (
                <DayPanel
                  date={dateStr}
                  posts={dayPosts}
                  brand={brand}
                  brandColor={brandColor}
                  onClose={() => setExpandedDay(null)}
                  onUpdate={setPosts}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 justify-end">
        {timeSlots.map(slot => (
          <div key={slot.label} className="flex items-center gap-1.5 text-xs text-white/40">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: slot.color }} />
            {slot.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayPanel({
  date,
  posts,
  brand,
  brandColor,
  onClose,
  onUpdate,
}: {
  date: string;
  posts: ScheduledPost[];
  brand: string;
  brandColor: string;
  onClose: () => void;
  onUpdate: (posts: ScheduledPost[]) => void;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAction = async (blotatoId: string, action: 'approve' | 'reject' | 'delete') => {
    setActionLoading(blotatoId + action);
    try {
      const res = await fetch(`/api/scheduled/${brand}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, blotato_id: blotatoId }),
      });
      if (res.ok) {
        const data = await res.json();
        // Refresh posts
        const refresh = await fetch(`/api/scheduled/${brand}`).then(r => r.json());
        onUpdate(refresh.posts ?? []);
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (posts.length === 0) {
    return (
      <div className="col-span-7 mt-2 p-6 rounded-xl border border-white/10 bg-white/5 text-center text-white/40 text-sm">
        No planned posts for {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    );
  }

  return (
    <div className="col-span-7 mt-2 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold">
          {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/30 transition text-sm"
        >
          ×
        </button>
      </div>

      <div className="divide-y divide-white/5">
        {posts.map(post => (
          <PostCard
            key={post.blotato_id}
            post={post}
            brand={brand}
            brandColor={brandColor}
            onAction={handleAction}
            loading={actionLoading === post.blotato_id + 'approve' || actionLoading === post.blotato_id + 'reject'}
          />
        ))}
      </div>
    </div>
  );
}

function PostCard({
  post,
  brand,
  brandColor,
  onAction,
  loading,
}: {
  post: ScheduledPost;
  brand: string;
  brandColor: string;
  onAction: (id: string, action: 'approve' | 'reject' | 'delete') => void;
  loading: boolean;
}) {
  const timeLabel = new Date(post.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="p-5">
      {/* Slot badge */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-xs px-2 py-0.5 rounded font-medium"
          style={{
            backgroundColor: post.slot === '9am' ? 'rgba(249,115,22,0.2)' : 'rgba(59,130,246,0.2)',
            color: post.slot === '9am' ? '#f97316' : '#3b82f6',
          }}
        >
          {post.slot === '9am' ? '🌅 9:00 AM' : '🌙 5:00 PM'}
        </span>
        <span className="text-xs text-white/40">{timeLabel}</span>
        <span
          className="text-xs px-2 py-0.5 rounded ml-auto"
          style={{
            backgroundColor: post.status === 'approved'
              ? 'rgba(34,197,94,0.2)'
              : post.status === 'rejected'
              ? 'rgba(239,68,68,0.2)'
              : 'rgba(250,204,21,0.2)',
            color: post.status === 'approved'
              ? '#22c55e'
              : post.status === 'rejected'
              ? '#ef4444'
              : '#facc15',
          }}
        >
          {post.status}
        </span>
      </div>

      {/* Carousel thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {post.ad_ids.map((id, idx) => (
          <div key={idx} className="w-16 h-16 rounded-lg bg-black/40 flex-shrink-0 overflow-hidden border border-white/10">
            <img
              src={`/images/ads/${brand}/${id}`}
              alt={id}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        ))}
      </div>

      {/* Caption + hashtags */}
      <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{post.caption}</p>
      {post.hashtags && (
        <p className="text-xs text-white/40 mt-2 whitespace-pre-wrap">{post.hashtags}</p>
      )}

      {/* Action buttons — only show for actionable posts */}
      {(post.status === 'pending' || post.status === 'preapproved') && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onAction(post.blotato_id, 'approve')}
            disabled={loading}
            className="flex-1 rounded-lg py-2 text-sm font-medium transition bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
          >
            ✓ Approve
          </button>
          <button
            onClick={() => onAction(post.blotato_id, 'reject')}
            disabled={loading}
            className="flex-1 rounded-lg py-2 text-sm font-medium transition bg-red-600/80 hover:bg-red-500/80 text-white disabled:opacity-50"
          >
            ✗ Disapprove
          </button>
          <button
            onClick={() => onAction(post.blotato_id, 'delete')}
            disabled={loading}
            className="px-4 rounded-lg py-2 text-sm text-white/40 hover:text-white/70 transition border border-white/10 hover:border-white/20"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
