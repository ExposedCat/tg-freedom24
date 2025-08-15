import { createHmac } from 'node:crypto';

export async function makeApiRequest<T = any>(
  apiKey: string,
  secretKey: string,
  cmd: string,
  params: Record<string, string> = {},
  version: 'v1' | 'v2' = 'v2',
): Promise<T | null> {
  try {
    if (version === 'v1') {
      const queryData = {
        cmd,
        params,
      };

      const queryParam = new URLSearchParams({
        q: JSON.stringify(queryData),
      });

      const res = await fetch(`https://tradernet.com/api/?${queryParam.toString()}`, {
        method: 'GET',
      });

      if (res.ok) {
        return await res.json();
      }
      try {
        const bodyText = await res.text();
        console.error(`[API] ${cmd} failed: ${res.status} ${res.statusText} - ${bodyText.slice(0, 500)}`);
      } catch {
        console.error(`[API] ${cmd} failed: ${res.status} ${res.statusText}`);
      }
      return null;
    }

    const nonce = Date.now().toString();

    let signatureString = `apiKey=${apiKey}&cmd=${cmd}&nonce=${nonce}`;

    if (Object.keys(params).length > 0) {
      const paramString = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      signatureString += `&params=${paramString}`;
    }

    const signature = createHmac('sha256', secretKey).update(signatureString).digest('hex');

    const bodyParams = new URLSearchParams({ apiKey, cmd, nonce });
    Object.entries(params).forEach(([key, value]) => {
      bodyParams.append(`params[${key}]`, value);
    });

    const res = await fetch(`https://tradernet.com/api/v2/cmd/${cmd}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-NtApi-PublicKey': apiKey,
        'X-NtApi-Sig': signature,
      },
      body: bodyParams.toString(),
    });

    if (res.ok) {
      return await res.json();
    }
    try {
      const bodyText = await res.text();
      console.error(`[API] ${cmd} failed: ${res.status} ${res.statusText} - ${bodyText.slice(0, 500)}`);
    } catch {
      console.error(`[API] ${cmd} failed: ${res.status} ${res.statusText}`);
    }
    return null;
  } catch (error) {
    console.error(`[API] Error making request to ${cmd}:`, error);
    return null;
  }
}
