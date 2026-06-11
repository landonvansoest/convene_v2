/** Demo session card for learner dashboard tour (not persisted; removed when the tour ends). */

export type TourDemoSessionShape = {
  booking_id: string;
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  payment_status: string;
  user_role: string;
  expert_id: string;
  learner_id: string;
  partner_name: string;
  partner_photo: string;
  tour_partner_profession: string;
  duration_minutes: number;
  tour_demo: true;
};

/** Wikimedia Commons (stable path; Bible reference “Einstein_1933a”). */
export const LEARNER_TOUR_EINSTEIN_PHOTO =
  "https://upload.wikimedia.org/wikipedia/commons/d/d3/Albert_Einstein_Head.jpg";

export function buildLearnerTourDemoSession(meLearnerId: string): TourDemoSessionShape {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const t1 = new Date(now.getTime() + 60 * 60 * 1000);
  const t2 = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const fmt = (dt: Date) => `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;

  return {
    booking_id: "__convene_tour_demo__",
    id: "__convene_tour_demo__",
    session_date: d,
    start_time: fmt(t1),
    end_time: fmt(t2),
    status: "upcoming",
    payment_status: "paid",
    user_role: "learner",
    expert_id: "00000000-0000-4000-8000-000000000001",
    learner_id: meLearnerId,
    partner_name: "Albert Einstein",
    partner_photo: LEARNER_TOUR_EINSTEIN_PHOTO,
    tour_partner_profession: "Theoretical Physicist & Nobel Prize Winner",
    duration_minutes: 60,
    tour_demo: true,
  };
}
