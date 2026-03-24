/**
 * Edge Function: create-user
 * 版本: v1.1
 * 日期: 2026-03-23
 * 用途: Admin 前端呼叫此 function 建立新使用者
 *       使用 service_role key（伺服器端安全存取）
 *
 * v1.1：鎖定 supabase-js@2.49.1 + 改用 adminClient.auth.getUser(token) 驗證
 * v1.0：初版
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 驗證呼叫者身份（必須是 admin）
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授權：缺少 Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const token = authHeader.replace("Bearer ", "")

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // ★ v1.1：用 service_role client + getUser(token) 驗證呼叫者
    // 這比用 anon key + global headers 更可靠
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token)
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "驗證失敗：" + (authErr?.message || "無效 token") }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 檢查是否為 admin
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single()

    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "只有 admin 可以建立帳號" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 取得請求資料
    const { email, password, display_name, role } = await req.json()

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "請提供 email 和密碼" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 用 service_role 建立使用者
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name || email.split("@")[0] },
    })

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 更新 profile 的 role 和 display_name（trigger 預設建 'user'）
    if (newUser.user) {
      const updates = { display_name: display_name || email.split("@")[0] }
      if (role && role !== "user") updates.role = role
      await adminClient
        .from("profiles")
        .update(updates)
        .eq("id", newUser.user.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user?.id,
          email: newUser.user?.email,
          display_name: display_name || email.split("@")[0],
          role: role || "user",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: "伺服器錯誤：" + err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
