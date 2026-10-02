# ER Diagram — Q-Care Hospital Queue Management

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar phone_number UK "เบอร์มือถือ ใช้รับ OTP / Login"
        varchar national_id UK "เลขบัตรประชาชน 13 หลัก"
        varchar full_name
        varchar password_hash "bcrypt/argon2"
        user_role role "patient | admin"
        boolean is_verified "ยืนยัน OTP แล้ว (กันสแปม)"
        boolean is_banned "Admin แบนผู้ใช้"
    }

    OTP_VERIFICATIONS {
        uuid id PK
        uuid user_id FK
        varchar otp_code "6 หลัก"
        timestamptz expires_at
        boolean is_used
    }

    DEPARTMENTS {
        uuid id PK
        varchar name UK
        text description
        char prefix UK "ตัวอักษรนำหน้าคิว A/B/C"
        boolean is_active
    }

    EXAMINATION_DESKS {
        uuid id PK
        uuid department_id FK
        varchar name "เช่น โต๊ะตรวจ 1"
        boolean is_active
    }

    QUEUES {
        uuid id PK
        varchar queue_number "เช่น A-012"
        date queue_date
        uuid patient_id FK "-> users.id"
        uuid department_id FK
        uuid desk_id FK "nullable ระบุตอนเรียกคิว"
        queue_status status "waiting|called|in_service|skipped|completed|cancelled"
        timestamptz called_at
        timestamptz completed_at
    }

    USERS          ||--o{ OTP_VERIFICATIONS : "ขอ OTP (1 คน หลาย record)"
    USERS          ||--o{ QUEUES           : "จองคิว / มีประวัติการจอง"
    DEPARTMENTS    ||--o{ EXAMINATION_DESKS : "แผนกหนึ่งมีหลายโต๊ะตรวจ"
    DEPARTMENTS    ||--o{ QUEUES           : "แผนกหนึ่งมีหลายคิว"
    EXAMINATION_DESKS ||--o{ QUEUES        : "โต๊ะหนึ่งให้บริการหลายคิว"
```

## ความสัมพันธ์ (Relationships)

| ความสัมพันธ์ | ประเภท | กติกา |
|---|---|---|
| users → queues | 1 : N | ผู้ป่วย 1 คนจองได้หลายคิว — partial unique index บังคับ "1 คิว active ต่อ 1 แผนก" |
| users → otp_verifications | 1 : N | ขอ OTP ได้หลายครั้ง (ลบ user = ลบ OTP ทิ้ง CASCADE) |
| departments → examination_desks | 1 : N | ลบแผนก = ลบโต๊ะตรวจทิ้งด้วย (CASCADE) |
| departments → queues | 1 : N | ห้ามลบแผนกถ้ายังมีคิวอยู่ (RESTRICT) |
| examination_desks → queues | 1 : N | Admin เรียกคิวแล้วกำหนดโต๊ะ (ลบโต๊ะ = SET NULL) |

## สถานะคิว (queue_status lifecycle)

```
waiting ──(Admin เรียก)──> called ──> in_service ──> completed
waiting ──(Admin ข้าม)──> skipped
waiting/called ──(ยกเลิก)──> cancelled
```

> ประวัติการจองของผู้ป่วย = record ใน `queues` ที่ status อยู่ใน
> completed / cancelled / skipped (คิววันเก่าเก็บตาม `queue_date`)
