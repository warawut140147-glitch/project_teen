-- ============================================================
-- Q-Care : Smart Hospital Queue Management — PostgreSQL Schema
-- ตาราง: users, otp_verifications, departments, examination_desks, queues
-- (Log การใช้งานเก็บใน NoSQL/MongoDB — ดู db/nosql-logs.md)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------- Enum Types ----------
CREATE TYPE user_role    AS ENUM ('patient', 'admin');
CREATE TYPE queue_status AS ENUM ('waiting', 'called', 'in_service', 'skipped', 'completed', 'cancelled');

-- ============================================================
-- 1) users : ผู้ป่วย + Admin (ตารางเดียว แยกบทบาทด้วย role)
-- ============================================================
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number   VARCHAR(10)  NOT NULL UNIQUE,
    national_id    VARCHAR(13)  NOT NULL UNIQUE,
    full_name      VARCHAR(150) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,            -- เก็บ hash (bcrypt/argon2) เท่านั้น
    role           user_role    NOT NULL DEFAULT 'patient',
    is_verified    BOOLEAN      NOT NULL DEFAULT FALSE,  -- ยืนยันตัวตนผ่าน OTP แล้วหรือยัง (กันบอทสแปม)
    is_banned      BOOLEAN      NOT NULL DEFAULT FALSE,  -- Admin แบนผู้ใช้ที่จองคิวเล่นซ้ำซาก
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_national_id CHECK (national_id ~ '^[0-9]{13}$'),
    CONSTRAINT chk_phone       CHECK (phone_number ~ '^0[0-9]{9}$')
);

-- ============================================================
-- 2) otp_verifications : รหัส OTP สำหรับยืนยันตัวตน (Register/Login)
-- ============================================================
CREATE TABLE otp_verifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_code    VARCHAR(6)   NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,                  -- หมดอายุ เช่น 5 นาที
    is_used     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_user       ON otp_verifications(user_id);
CREATE INDEX idx_otp_expires_at ON otp_verifications(expires_at);

-- ============================================================
-- 3) departments : แผนก (Admin CRUD)
-- ============================================================
CREATE TABLE departments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    prefix      CHAR(1)      NOT NULL UNIQUE,           -- ตัวอักษรนำหน้าเลขคิว เช่น A, B, C
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4) examination_desks : โต๊ะตรวจของแต่ละแผนก (Admin CRUD)
-- ============================================================
CREATE TABLE examination_desks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name          VARCHAR(50)  NOT NULL,                -- เช่น "โต๊ะตรวจ 1"
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (department_id, name)
);

-- ============================================================
-- 5) queues : คิวของผู้ป่วย (ประวัติการจอง = record เก่าที่ status จบแล้ว)
-- ============================================================
CREATE TABLE queues (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    queue_number  VARCHAR(10)  NOT NULL,                -- เช่น "A-012" (รันต่อแผนก/วัน)
    queue_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
    patient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    desk_id       UUID REFERENCES examination_desks(id) ON DELETE SET NULL,  -- ระบุตอน Admin เรียกคิว
    status        queue_status NOT NULL DEFAULT 'waiting',
    symptoms      TEXT,                                  -- อาการเบื้องต้นที่ผู้ป่วยกรอกตอนจองคิว
    called_at     TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queues_dept_status ON queues(department_id, status);
CREATE INDEX idx_queues_patient     ON queues(patient_id);
CREATE INDEX idx_queues_date        ON queues(queue_date);

-- กันจองคิวซ้ำ: 1 คน มีได้ 1 คิวที่ยังไม่จบ ต่อ 1 แผนก (กันจองเล่นซ้ำซาก/บอท)
CREATE UNIQUE INDEX uniq_active_queue_per_patient
    ON queues(patient_id, department_id)
    WHERE status IN ('waiting', 'called', 'in_service');

-- กันเลขคิวซ้ำในแผนกเดียวกันของวันเดียวกัน
CREATE UNIQUE INDEX uniq_queue_number_daily
    ON queues(department_id, queue_date, queue_number);

-- ============================================================
-- updated_at อัตโนมัติ
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated     BEFORE UPDATE ON users             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_departments_updt  BEFORE UPDATE ON departments       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_desks_updated     BEFORE UPDATE ON examination_desks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_queues_updated    BEFORE UPDATE ON queues            FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Seed ข้อมูลเริ่มต้น
-- ============================================================
INSERT INTO departments (name, description, prefix) VALUES
    ('แผนกอายุรกรรม',    'ตรวจโรคทั่วไป',       'A'),
    ('แผนกทันตกรรม',     'ทันตกรรมและช่องปาก',   'B'),
    ('แผนกกุมารเวชกรรม', 'ตรวจโรคเด็ก',         'C');

INSERT INTO examination_desks (department_id, name)
SELECT id, 'โต๊ะตรวจ 1' FROM departments;

-- ตัวอย่าง Admin (รหัสผ่านต้อง hash ด้วยแอปพลิเคชันก่อน INSERT จริง)
-- INSERT INTO users (phone_number, national_id, full_name, password_hash, role, is_verified)
-- VALUES ('0812345678', '1000000000001', 'Admin', '$2b$10$...', 'admin', TRUE);
