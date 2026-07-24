import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const WORDS = ["Cedar", "Crown", "Arena", "Royal"];

function makeTempPassword() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const digits = String(100000 + Math.floor(Math.random() * 900000));
  return word + digits;
}

export async function POST(request) {
  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  }

  const server = await supabaseServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: callerProfile } = await server
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "not admin" }, { status: 403 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "cannot reset own account" }, { status: 400 });
  }

  const tempPassword = makeTempPassword();
  const admin = supabaseAdmin();

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }
  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);

  return NextResponse.json({ tempPassword });
}
