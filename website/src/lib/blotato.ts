const API_KEY = process.env.BLOTATO_API_KEY ?? '';
const BASE_URL = 'https://backend.blotato.com/v2';

export type BlotatoSchedule = {
  id: string;
  scheduledAt: string;
  account: {
    id: string;
    name: string;
    username: string;
    profileImageUrl: string | null;
    subaccountId: string | null;
    subId: string | null;
    subaccountName: string | null;
  };
  draft: {
    accountId: string;
    content: {
      text: string;
      mediaUrls: string[];
      platform: string;
    };
    target: {
      targetType: string;
    };
  };
};

export async function getBlotatoSchedules(): Promise<BlotatoSchedule[]> {
  if (!API_KEY) throw new Error('BLOTATO_API_KEY not set');
  const res = await fetch(`${BASE_URL}/schedules?limit=50`, {
    headers: {
      'blotato-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Blotato error: ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  if (!API_KEY) throw new Error('BLOTATO_API_KEY not set');
  const res = await fetch(`${BASE_URL}/schedules/${scheduleId}`, {
    method: 'DELETE',
    headers: { 'blotato-api-key': API_KEY },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete schedule: ${res.status}`);
  }
}
