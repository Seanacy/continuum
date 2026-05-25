import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { refreshTokenIfNeeded } from '@/lib/meta-auth';

// Runs daily to refresh Facebook tokens before they expire
// Vercel cron: 0 3 * * * (3 AM UTC daily)

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { accountId: string; pageName: string; status: string; error?: string }[] = [];

  try {
    // Get all active Facebook accounts with tokens expiring in the next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const accounts = await db.facebookAccount.findMany({
      where: {
        status: 'active',
        tokenExpiresAt: {
          lte: sevenDaysFromNow,
        },
      },
      select: {
        id: true,
        fbPageName: true,
        userId: true,
        tokenExpiresAt: true,
      },
    });

    console.log(`[token-refresh] Found ${accounts.length} accounts needing refresh`);

    for (const account of accounts) {
      try {
        await refreshTokenIfNeeded(account.id);
        results.push({
          accountId: account.id,
          pageName: account.fbPageName || 'Unknown',
          status: 'refreshed',
        });
        console.log(`[token-refresh] Refreshed token for ${account.fbPageName}`);
      } catch (error: any) {
        // If refresh fails, mark account as expired
        if (account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) {
          await db.facebookAccount.update({
            where: { id: account.id },
            data: { status: 'expired' },
          });
        }

        results.push({
          accountId: account.id,
          pageName: account.fbPageName || 'Unknown',
          status: 'failed',
          error: error.message,
        });
        console.error(`[token-refresh] Failed for ${account.fbPageName}:`, error.message);
      }
    }

    // Also check for already-expired accounts and mark them
    const expiredAccounts = await db.facebookAccount.findMany({
      where: {
        status: 'active',
        tokenExpiresAt: {
          lt: new Date(),
        },
      },
    });

    for (const acc of expiredAccounts) {
      await db.facebookAccount.update({
        where: { id: acc.id },
        data: { status: 'expired' },
      });
      results.push({
        accountId: acc.id,
        pageName: acc.fbPageName || 'Unknown',
        status: 'marked_expired',
      });
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error: any) {
    console.error('[token-refresh] Cron error:', error);
    return NextResponse.json(
      { error: error.message || 'Token refresh cron failed' },
      { status: 500 }
    );
  }
}
