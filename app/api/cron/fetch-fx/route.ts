import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const res = await fetch(`https://open.er-api.com/v6/latest/USD`);
  const data = await res.json();
  const usdThbRate = data.rates.THB;

  await supabase.from('fx_rates').insert({ rate: usdThbRate });

  return NextResponse.json({ success: true, rate: usdThbRate });
}