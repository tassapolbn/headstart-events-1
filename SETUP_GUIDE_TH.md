# คู่มือติดตั้งฉบับย่อ (ภาษาไทย)
# HeadStart Events Registration Platform

ระบบลงทะเบียนกิจกรรมของโรงเรียน ใช้แทน Google Forms ทั้งหมด
มีแผนผังบูธแบบอินเทอร์แอคทีฟ จองบูธแบบเรียลไทม์ สร้างฟอร์มแบบลากวาง
ส่งอีเมลยืนยันอัตโนมัติ เช็คอินด้วย QR Code และพิมพ์ป้ายชื่อร้านค้าได้

ใช้บริการฟรีทั้งหมด: Supabase (ฐานข้อมูล) + Netlify (เว็บไซต์) + Apps Script (ส่งอีเมล)

---

## ขั้นตอนที่ 1: สร้างฐานข้อมูลบน Supabase (ประมาณ 10 นาที)

1. สมัครบัญชีฟรีที่ https://supabase.com แล้วกด **New project**
   - เลือก Region: **Singapore** (เร็วที่สุดจากภูเก็ต)
   - ตั้งรหัสผ่านฐานข้อมูลแล้วจดเก็บไว้
2. เมื่อโปรเจกต์พร้อม ไปที่เมนู **SQL Editor** กด **New query**
3. เปิดไฟล์ `supabase/schema.sql` คัดลอกทั้งหมด วางลงไป แล้วกด **Run**
   - ระบบจะสร้างตาราง กฎความปลอดภัย ที่เก็บไฟล์ และฟังก์ชันทั้งหมดให้อัตโนมัติ
4. สร้างบัญชีผู้ดูแล: ไปที่ **Authentication -> Users -> Add user -> Create new user**
   - ใส่อีเมลและรหัสผ่านของ Boss แล้วติ๊ก **Auto confirm user**
5. ปิดการสมัครสมาชิกสาธารณะ: **Authentication -> Sign In / Up** ปิด **Allow new users to sign up**
6. คัดลอกค่า 2 ค่าจาก **Project Settings -> API** เก็บไว้ใช้ขั้นตอนถัดไป
   - **Project URL** เช่น `https://abcd1234.supabase.co`
   - **anon public key**

## ขั้นตอนที่ 2: นำเว็บขึ้น Netlify (ประมาณ 5 นาที)

วิธีที่แนะนำ (ผ่าน GitHub อัปเดตอัตโนมัติ):
1. อัปโหลดโฟลเดอร์โปรเจกต์นี้ขึ้น GitHub repository ของ Boss
2. เข้า https://app.netlify.com กด **Add new site -> Import an existing project** เลือก repo
3. ก่อนกด Deploy ไปที่ **Site configuration -> Environment variables** เพิ่ม 2 ค่า
   - `VITE_SUPABASE_URL` = Project URL จากขั้นตอนที่ 1
   - `VITE_SUPABASE_ANON_KEY` = anon public key จากขั้นตอนที่ 1
4. กด Deploy รอสักครู่ เว็บจะออนไลน์ที่ `https://ชื่อเว็บ.netlify.app`

วิธีสำรอง (ไม่ใช้ GitHub):
1. ติดตั้ง Node.js บนคอมพิวเตอร์ แล้วเปิด Terminal ในโฟลเดอร์โปรเจกต์
2. สร้างไฟล์ `.env` โดยคัดลอกจาก `.env.example` แล้วใส่ค่า 2 ค่าข้างต้น
3. รันคำสั่ง `npm install` ตามด้วย `npm run build`
4. ลากโฟลเดอร์ `dist` ที่ได้ ไปวางบนหน้า Netlify

## ขั้นตอนที่ 3: ตั้งค่าระบบส่งอีเมล (ประมาณ 5 นาที)

อีเมลยืนยันจะส่งจาก Gmail ของโรงเรียนผ่าน Apps Script (วิธีที่ Boss คุ้นเคยอยู่แล้ว)

1. ไปที่ https://script.google.com กด **New project** ตั้งชื่อว่า `HeadStart Events Email Relay`
2. คัดลอกไฟล์ `apps-script/EmailRelay.gs` ทั้งหมด วางแทนโค้ดใน Code.gs
3. ไปที่ **Project Settings (ไอคอนเฟือง) -> Script Properties** เพิ่ม 3 ค่า
   - `SUPABASE_URL` = Project URL
   - `SERVICE_ROLE_KEY` = คีย์ service_role (อยู่ใน Supabase: Project Settings -> API)
     ข้อควรระวัง: คีย์นี้เก็บใน Apps Script เท่านั้น ห้ามใส่ในเว็บไซต์
   - `FROM_NAME` = HeadStart Events
4. กด **Deploy -> New deployment -> Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - อนุญาตสิทธิ์เมื่อระบบถาม แล้วคัดลอก **Web app URL** (ลงท้ายด้วย /exec)
5. เปิดเว็บของเรา ไปที่ `/admin` เข้าสู่ระบบ แล้วไปหน้า **Settings**
   - วาง Web app URL ในช่อง **Relay web app URL**
   - ใส่อีเมลผู้ดูแล แล้วกด **Save settings**
   - กด **Send a test email** เพื่อทดสอบ
6. (ทางเลือก) สรุปยอดลงทะเบียนรายวัน: ใน Apps Script ไปที่เมนู **Triggers (ไอคอนนาฬิกา)**
   เพิ่ม trigger ให้ฟังก์ชัน `dailySummary` แบบ Time driven ทุกวันช่วง 07:00 ถึง 08:00

## ขั้นตอนที่ 4: สร้างกิจกรรมแรก

1. เข้า `https://ชื่อเว็บ.netlify.app/admin` แล้วเข้าสู่ระบบ
2. กด **Create New Event** ตั้งชื่อ เช่น Friday Market
3. แท็บ **Details**: ใส่วันที่ เวลา สถานที่ ช่วงเวลาเปิดรับสมัคร และจำนวนรับสูงสุด
4. แท็บ **Form Builder**: กด **Insert vendor questions** เพื่อใส่ชุดคำถามร้านค้าสำเร็จรูป
   หรือเพิ่มคำถามเอง ลากสลับลำดับได้
5. แท็บ **Floor Plan**: เปิดสวิตช์ อัปโหลดภาพแผนผัง (ถ้ามี) แล้ววาดบูธด้วยเครื่องมือปากกา
   ตั้งชื่อ หมายเลข สี และสถานะของแต่ละบูธ เสร็จแล้วกด **Save layout**
6. แท็บ **Branding & Theme**: เลือกธีมสำเร็จรูปหรือปรับสีเอง อัปโหลดโปสเตอร์และแบนเนอร์
7. แท็บ **Email**: ปรับข้อความอีเมลยืนยัน ใช้ merge fields เช่น `{{Name}}` `{{Booth}}` ได้
8. เปลี่ยนสถานะกิจกรรมเป็น **Open** แล้วกด **Save**
9. กด **Copy link** แล้วส่งลิงก์ให้ผู้ปกครองหรือร้านค้าได้เลย ผู้ลงทะเบียนไม่ต้องมีบัญชี

## เคล็ดลับ

- ใช้ **Save as template** เพื่อเก็บกิจกรรมไว้ใช้ซ้ำ เช่น Friday Market ทุกเดือน
- หน้า **Check in**: ใช้กล้องสแกน QR จากอีเมลของผู้ลงทะเบียนในวันงาน
- หน้า **Vendor signs**: พิมพ์ป้ายตั้งโต๊ะ A4 หรือ A3 พร้อม QR และโลโก้โรงเรียน
- บูธที่ถูกจองแล้วจะเปลี่ยนเป็นสีแดงทันทีบนหน้าจอของทุกคน ไม่มีทางจองซ้ำกันได้
  เพราะฐานข้อมูลล็อกให้ 1 บูธต่อ 1 การลงทะเบียนเท่านั้น

## แก้ปัญหาเบื้องต้น

- หน้าเว็บว่างเปล่า: ตรวจ Environment variables 2 ค่าบน Netlify แล้ว Deploy ใหม่
- เข้าสู่ระบบไม่ได้: ตรวจว่าสร้าง user ใน Supabase Authentication และติ๊ก Auto confirm แล้ว
- อีเมลไม่ส่ง: กดปุ่ม Send a test email ในหน้า Settings แล้วดู log ใน Apps Script
  (เมนู Executions) และตรวจ Script Properties ทั้ง 3 ค่า
