/**
 * Edge Function: delete-user
 * 版本: v1.0
 * 日期: 2026-09-01
 * 用途: Admin 前端呼叫此 function 刪除使用者
 *       使用 service_role key（刪 auth.users 只能在伺服器端做）
 *
 * 變更紀錄：
 *  v1.0 初版。照 create-user v1.1 的驗證流程寫（service_role client + getUser(token)）。
 *       多三道防呆：不能刪自己、不能刪掉最後一個 admin、先清 user_projects 再刪帳號
 *       （避免 FK 沒設 CASCADE 時整筆失敗）。
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
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
      return json({ error: "未授權：缺少 Authorization header" }, 401)
    }

    const token = authHeader.replace("Bearer ", "")

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token)
    if (authErr || !caller) {
      return json({ error: "驗證失敗：" + (authErr?.message || "無效 token") }, 401)
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single()

    if (callerProfile?.role !== "admin") {
      return json({ error: "只有 admin 可以刪除帳號" }, 403)
    }

    // 取得請求資料
    const { user_id } = await req.json()
    if (!user_id) {
      return json({ error: "請提供 user_id" }, 400)
    }

    // 防呆 1：不能刪自己
    if (user_id === caller.id) {
      return json({ error: "不能刪除自己的帳號" }, 400)
    }

    // 取目標 profile（順便確認人存在）
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("display_name, role")
      .eq("id", user_id)
      .single()

    // 防呆 2：不能刪掉最後一個 admin（刪光了沒人進得了管理頁）
    if (targetProfile?.role === "admin") {
      const { count } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
      if ((count ?? 0) <= 1) {
        return json({ error: "這是最後一個管理員，不能刪除" }, 400)
      }
    }

    // 先清 user_projects（若 FK 已設 CASCADE 這步是多餘的，但不會出錯）
    const { error: upErr } = await adminClient
      .from("user_projects")
      .delete()
      .eq("user_id", user_id)
    if (upErr) {
      return json({ error: "清除可見案件失敗：" + upErr.message }, 400)
    }

    // 刪帳號（profiles 有 ON DELETE CASCADE，會一起清掉）
    const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id)
    if (delErr) {
      return json({ error: delErr.message }, 400)
    }

    return json({
      success: true,
      deleted: {
        id: user_id,
        display_name: targetProfile?.display_name || "",
      },
    })
  } catch (err) {
    return json({ error: "伺服器錯誤：" + (err as Error).message }, 500)
  }
})
