// Shared between the hotels page's destination cards/request form and the
// booking-search-widget's hotel tab, so the widget's city select always
// offers exactly the cities the request form below can actually prefill.
export type HotelDestination = {
  city: string;
  note: string;
  rating: string;
  price: string;
};

export const HOTEL_DESTINATIONS: HotelDestination[] = [
  { city: "مكة المكرمة", note: "بجوار الحرم مباشرة", rating: "4.8", price: "480" },
  { city: "المدينة المنورة", note: "على مقربة من المسجد النبوي", rating: "4.7", price: "350" },
  { city: "جدة", note: "بالقرب من الواجهة البحرية", rating: "4.6", price: "290" },
  { city: "القاهرة", note: "في قلب المدينة", rating: "4.5", price: "210" },
  { city: "دبي", note: "بالقرب من وسط المدينة", rating: "4.7", price: "610" },
  { city: "إسطنبول", note: "في المنطقة التاريخية", rating: "4.6", price: "340" },
];

export const HOTEL_CITIES = HOTEL_DESTINATIONS.map((d) => d.city);
