import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data: history, error } = await supabase
      .from('upload_history')
      .select('*')
      .order('uploaded_at', { ascending: false }); // เรียงจากอัปโหลดล่าสุดขึ้นก่อน

    if (error) throw error;

    return NextResponse.json({ success: true, data: history });
  } catch (error: any) {
    console.error("History API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch upload history' }, { status: 500 });
  }
}