-- Sprint EDIT-RESERVATION — bitácora/chat humano per reserva.
-- Append-only. Diferente de guest_stay_logs (audit automático del sistema).

-- CreateTable
CREATE TABLE "guest_stay_notes" (
    "id" TEXT NOT NULL,
    "stay_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'GENERAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),

    CONSTRAINT "guest_stay_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (covering index para list por stay sorted by created)
CREATE INDEX "guest_stay_notes_stay_id_created_at_idx" ON "guest_stay_notes"("stay_id", "created_at");

-- AddForeignKey
ALTER TABLE "guest_stay_notes" ADD CONSTRAINT "guest_stay_notes_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "guest_stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
