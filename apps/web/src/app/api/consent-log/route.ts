"use server";

import { NextRequest, NextResponse } from 'next/server';

/**
 * Cookie Consent Log API
 * Logs user cookie consent for KVKK/GDPR compliance
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const logEntry = {
            timestamp: new Date().toISOString(),
            type: body.type || 'cookie_consent',
            preferences: body.preferences,
            userAgent: body.userAgent,
            ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        };

        // In production, you would save this to a database
        // For now, log to console (will appear in server logs)
        console.log('[Consent Log]', JSON.stringify(logEntry));

        // You could also forward to your NestJS API:
        // await fetch(`${process.env.NEXT_PUBLIC_API_URL}/consent-log`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(logEntry),
        // });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Consent Log Error]', error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
