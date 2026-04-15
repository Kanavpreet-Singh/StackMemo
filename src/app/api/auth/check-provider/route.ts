import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ provider: null });
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: { accounts: true },
        });

        if (!user) {
            return NextResponse.json({ provider: null });
        }

        // Check if user signed up with Google but has no password
        const hasGoogle = user.accounts.some((a) => a.provider === "google");
        const hasPassword = !!user.hashedPassword;

        if (hasGoogle && !hasPassword) {
            return NextResponse.json({ provider: "google", hasPassword: false });
        }

        if (hasGoogle && hasPassword) {
            return NextResponse.json({ provider: "google", hasPassword: true });
        }

        return NextResponse.json({ provider: "credentials", hasPassword });
    } catch {
        return NextResponse.json({ provider: null });
    }
}
