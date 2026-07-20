import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import type { Context, Next } from 'hono';

// Cache the JWKS mapping by issuer domain
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const requireAuth = async (c: Context, next: Next) => {
  const jwt = c.req.header('Cf-Access-Jwt-Assertion');
  
  if (!jwt) {
    return c.json({ success: false, error: 'Unauthorized: Missing Cloudflare Access JWT' }, 401);
  }

  try {
    const issuer = (c.env as any).CF_ACCESS_ISSUER;
    const audience = (c.env as any).CF_ACCESS_AUDIENCE;

    if (!issuer || !audience) {
       let configurationHint: { issuer?: string, audience?: string | string[] } | undefined;
       try {
         const unverified = decodeJwt(jwt);
         configurationHint = { issuer: unverified.iss, audience: unverified.aud };
       } catch {
         // The normal verification path below remains mandatory once configured.
       }
       return c.json({
         success: false,
         error: 'Internal Server Error: Missing Cloudflare Access configuration',
         configurationHint
       }, 500);
    }

    // 2. Fetch or retrieve cached JWKS for this issuer
    let jwks = jwksCache.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksCache.set(issuer, jwks);
    }

    // 3. Verify the token using jose
    const { payload } = await jwtVerify(jwt, jwks, {
      issuer,
      audience
    });

    const email = (payload.email as string)?.toLowerCase();
    const sub = payload.sub as string;

    if (!email) {
      return c.json({ success: false, error: 'Unauthorized: Email claim missing' }, 401);
    }

    // 4. Set the verified identity in the Hono context
    c.set('userEmail', email);
    c.set('userSub', sub);

    // 5. Look up user in DB for RBAC
    const db = (c.env as any).DB;
    if (db) {
      let user = await db.prepare('SELECT id, status FROM users WHERE email = ?').bind(email).first();
      
      if (!user) {
        // Auto-provision user if they pass Cloudflare Access
        const newId = 'usr_' + Date.now();
        await db.prepare('INSERT INTO users (id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(newId, email, 'Auto Admin', 'active', Date.now(), Date.now()).run();
        await db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
          .bind(newId, 'administrator').run();
        user = { id: newId, status: 'active' };
      }

      if (user.status !== 'active') {
        return c.json({ success: false, error: `Forbidden: User inactive (${email})` }, 403);
      }
      
      const roles = await db.prepare('SELECT role FROM user_roles WHERE user_id = ?').bind(user.id).all();
      c.set('userId', user.id);
      // Ensure they have administrator role if they passed Cloudflare Access
      const roleList = roles.results?.map((r: any) => r.role) || [];
      if (!roleList.includes('administrator')) roleList.push('administrator');
      
      c.set('userRoles', roleList);
    }

    await next();
  } catch (error: any) {
    console.error('JWT Verification failed:', error);
    return c.json({ success: false, error: `Unauthorized: ${error.message || 'Token validation failed'}` }, 401);
  }
};
