import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const token = request.cookies.get('preventiq_token')?.value

    // Paths that don't require authentication
    const publicPaths = ['/login', '/signup', '/api/auth']
    const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path))

    if (!token && !isPublicPath) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if (token && isPublicPath && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    return NextResponse.next()
}

// Config to match all paths except static files and public assets
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public (public assets)
         */
        '/((?!_next/static|_next/image|favicon.ico|public).*)',
    ],
}
