// Push notifications to the iPhone / Android app through Firebase Cloud Messaging (HTTP v1).
// The app registers its FCM token with POST /api/push-token; the server sends as its own service account
// (roles/firebasecloudmessaging.admin), so the app holds no keys. APNs is wired up in the Firebase console.
import { isLang, type Lang } from '../src/lang.ts';
import { projectId } from './auth.ts';
import { getAccount, update } from './accounts.ts';
import { serverToken } from './google.ts';

const TEXT: Record<Lang, { done: string; ready: string }> = {
  ja: { done: '書き出しが終わりました', ready: 'AIの編集ができあがりました' },
  en: { done: 'Your Reel is exported', ready: 'Your AI edit is ready' },
  fr: { done: 'Votre Reel est exporté', ready: 'Votre montage IA est prêt' },
  id: { done: 'Reel kamu sudah diekspor', ready: 'Hasil edit AI sudah siap' },
  zh: { done: '视频已导出', ready: 'AI 剪辑已完成' },
  es: { done: 'Tu Reel ya está exportado', ready: 'Tu edición con IA está lista' },
  ta: { done: 'உங்கள் ரீல் ஏற்றுமதி முடிந்தது', ready: 'AI திருத்தம் தயார்' },
};

export async function addDevice(uid: string, token: string, platform: string, lang: unknown) {
  await update(uid, (a) => {
    const others = (a.devices ?? []).filter((d) => d.token !== token);
    a.devices = [...others, { token, platform: platform === 'android' ? ('android' as const) : ('ios' as const), lang: isLang(lang) ? lang : 'ja', at: new Date().toISOString() }].slice(-5);
  });
}

export async function removeDevice(uid: string, token: string) {
  await update(uid, (a) => {
    a.devices = (a.devices ?? []).filter((d) => d.token !== token);
  });
}

/** Tells every phone of this user that a job reached `kind`. Failures are logged, never thrown. */
export async function notifyJob(uid: string, kind: 'done' | 'ready', job: { id: string; title: string }) {
  try {
    const devices = (await getAccount(uid)).devices ?? [];
    if (!devices.length || !projectId) return;
    const token = await serverToken();
    if (!token) return;
    const dead: string[] = [];
    await Promise.all(
      devices.map(async (d) => {
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.token,
              notification: { title: TEXT[d.lang as Lang]?.[kind] ?? TEXT.ja[kind], body: job.title.slice(0, 60) },
              data: { jobId: job.id, kind },
              apns: { payload: { aps: { sound: 'default' } } },
              android: { priority: 'high', notification: { sound: 'default' } },
            },
          }),
        });
        if (r.ok) return;
        const body = await r.text();
        // The app was removed or the token rotated: forget it.
        if (r.status === 404 || /UNREGISTERED|not a valid FCM registration token/.test(body)) dead.push(d.token);
        else console.error('push', r.status, body);
      }),
    );
    if (dead.length) await update(uid, (a) => void (a.devices = (a.devices ?? []).filter((d) => !dead.includes(d.token))));
  } catch (e) {
    console.error('push', e);
  }
}
