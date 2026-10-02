# NoSQL Design — Activity/Notification Logs (MongoDB)

ระบบใช้ฐานข้อมูลแบบผสม (Polyglot Persistence):

| ข้อมูล | ฐานข้อมูล | เหตุผล |
|---|---|---|
| users, queues, departments, desks, otp | **PostgreSQL (SQL)** | โครงสร้างชัดเจน, ต้องการ constraint/transaction/index |
| Log การใช้งาน, การแจ้งเตือน | **MongoDB (NoSQL)** | โครงสร้างยืดหยุ่น ต่างกันตามประเภทเหตุการณ์, เขียนถี่, ขยาย scale ง่าย |

## Collection: `activity_logs`

```json
{
  "_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "actor_id": "uuid-ของ-user-ที่ทำรายการ",
  "actor_role": "admin",
  "action": "queue_update",
  "detail": "คิว A-009 → called ที่โต๊ะตรวจ 1",
  "context": {
    "queue_id": "uuid",
    "department_id": "uuid",
    "from_status": "waiting",
    "to_status": "called",
    "ip": "203.150.x.x"
  },
  "created_at": "2026-10-02T09:30:00Z"
}
```

ประเภท `action` ที่บันทึก: `register`, `otp_verify`, `login`, `login_failed`,
`queue_create`, `queue_cancel`, `queue_update` (call/skip/complete),
`department_create/update/delete`, `desk_create/delete`, `user_ban/unban`

## Collection: `notification_logs`

```json
{
  "_id": "665f1a2b3c4d5e6f7a8b9c0e",
  "user_id": "uuid-ของผู้ป่วย",
  "channel": "web_push",
  "title": "ใกล้ถึงคิวของคุณแล้ว",
  "body": "คิว A-012 ของคุณเหลืออีก 2 คิว",
  "read": false,
  "created_at": "2026-10-02T09:35:00Z"
}
```

## Index แนะนำ

```js
db.activity_logs.createIndex({ created_at: -1 })
db.activity_logs.createIndex({ actor_id: 1, created_at: -1 })
db.notification_logs.createIndex({ user_id: 1, read: 1, created_at: -1 })
```

> ในโปรโตไทป์ (frontend/index.html) ฟังก์ชัน `addLog()` จำลองการเขียน
> collection `activity_logs` ไว้ในหน่วยความจำ + console.log
