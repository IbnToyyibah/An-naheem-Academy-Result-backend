# Junior Secondary School Result Management Portal

A full-stack result management portal for Junior Secondary School administrators and parents.

## Features

- Admin and parent JWT authentication.
- Student, class, subject, session, and term management.
- Passport upload with JPG, JPEG, and PNG validation stored in Cloudinary.
- Result entry for thirteen subjects with automatic total, grade, and remark calculation.
- Parent dashboard for profile, result viewing, password change, and printing.
- MySQL schema with relationships and seed data.
- Responsive React UI with protected routes.

## Quick Start

1. Create a MySQL database and import `database/schema.sql`.
2. Copy `backend/.env.example` to `backend/.env` and update the database credentials.
3. Set your Cloudinary credentials in `backend/.env` so passport images are uploaded to Cloudinary instead of the local server disk.
4. Install dependencies:

```bash
npm run install:all
```

5. Start both apps:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend (production): `https://an-naheem-academy-result-backend.onrender.com` — set VITE_API_URL and VITE_FILE_URL in Vercel to point to this URL

## Default Admin

Run the backend seed script after configuring `.env`:

```bash
npm run seed --workspace backend
```

- Username: `admin`
- Password: `admin`

Parent login uses the student's admission number as the ID and `0823` as the default password.

## Project Structure

```text
backend/     Express API, MySQL repositories, authentication, uploads
frontend/    React app, pages, routes, context, services, responsive UI
database/    Mongodb
docs/        API endpoint documentation
```
