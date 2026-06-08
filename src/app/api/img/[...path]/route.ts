import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'character-images'
// Folders whose 2nd path segment is a characterId.
const CHARACTER_FOLDERS = ['generated', 'ref-images', 'references']

// Streams a character image ONLY to the signed-in user who owns it.
// No public links: every request must carry a valid session cookie, and the
// resource in the path must belong to that user.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const segments = (await params).path || []
  if (segments.length < 2) {
    return NextResponse.json({ error: 'Bad path' }, { status: 400 })
  }

  // Ownership check, depending on the storage layout.
  let owned = false
  if (CHARACTER_FOLDERS.includes(segments[0])) {
    // <folder>/<characterId>/<file...>
    const character = await db.character.findFirst({
      where: { id: segments[1], userId: user.id },
      select: { id: true },
    })
    owned = !!character
  } else {
    // <userId>/<...> (e.g. scene images live under the user's own folder)
    owned = segments[0] === user.id
  }

  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const storagePath = segments.join('/').split('?')[0]

  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
  if (error || !data) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }

  const arrayBuffer = await data.arrayBuffer()
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': data.type || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
