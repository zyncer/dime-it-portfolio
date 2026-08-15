import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data: transactions, error } = await supabase
      .from('portfolio_transactions')
      .select('*')
      .order('timestamp', { ascending: false }); // เรียงจากใหม่ไปเก่า

    if (error) throw error;

    return NextResponse.json({ success: true, data: transactions });
  } catch (error: any) {
    console.error("Ledger API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch ledger data' }, { status: 500 });
  }
}