import { emergencyHealthDetector } from '@/ai/flows/emergency-health-detector';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await emergencyHealthDetector(body);
    return NextResponse.json({ success: true, isEmergency: result.isEmergency, escalation: result, response: result.urgencyMessage });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}