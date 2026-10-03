# BookCart — Application Analysis (Pre-Automation)

> هدف این سند: شناخت رفتار واقعی اپلیکیشن و Business Flowهای آن **قبل از نوشتن تست اتوماسیون**.
> روش تحلیل: بررسی black-box با مرورگر + بررسی قرارداد API از طریق Swagger عمومی سایت.
> تاریخ تحلیل: 2026-10-03

---

## 1. شناخت کلی اپلیکیشن

BookCart یک فروشگاه آنلاین کتاب demo است که با **Angular 18 + ASP.NET Core (.NET 8) + SQL Server** ساخته شده (پروژه متن‌باز: github.com/AnkitSharma-007/bookcart).

- احراز هویت: **JWT** با Auth Guard روی مسیرهای حساس (Checkout و...)
- کاربر **مهمان (Guest)** می‌تواند بدون لاگین کتاب ببیند و به سبد اضافه کند؛ فقط Checkout نیاز به لاگین دارد.
- سبد خرید مهمان با یک **userId عددی تصادفی در localStorage** نگه‌داری می‌شود و بعد از لاگین به حساب کاربر منتقل (merge) می‌شود.
- قیمت‌ها به **روپیه هند (₹)** نمایش داده می‌شوند.
- سایت Swagger عمومی دارد: `/swagger/index.html` — منبع عالی برای تست API.

### صفحات و مسیرهای شناسایی‌شده

| صفحه | مسیر (Route) | نیاز به لاگین؟ |
|---|---|---|
| صفحه اصلی + لیست کتاب‌ها | `/` | خیر |
| نتایج جستجو | `/search?item={query}` | خیر |
| جزئیات کتاب | `/bookdetails/{bookId}` | خیر |
| ورود | `/login` (با `?returnUrl=` پس از ریدایرکت گارد) | خیر |
| ثبت‌نام | `/register` | خیر |
| سبد خرید | `/shopping-cart` | خیر |
| تسویه حساب | `/checkout` | **بله** — ریدایرکت به `/login?returnUrl=%2Fcheckout` |

عناصر ثابت Header: لوگو/بازگشت به خانه، جستجو (combobox با placeholder «Search books or authors»)، آیکون سبد با badge تعداد، دکمه Login، لینک Swagger، لینک GitHub.
سایدبار صفحه اصلی: دسته‌بندی‌ها (**Biography, Fiction, Mystery, Fantasy, Romance**) + **Price Filter** (اسلایدر).

---

## 2. User Flowهای مهم

1. **Flow مهمان:** دیدن لیست → فیلتر/جستجو → جزئیات کتاب → افزودن به سبد → تغییر تعداد → (بدون لاگین، سبد در localStorage می‌ماند)
2. **Flow خرید کامل (مسیر اصلی درآمد):** همان Flow مهمان → Checkout → ریدایرکت به Login → ورود/ثبت‌نام → **ادغام سبد مهمان با سبد کاربر** → تکمیل اطلاعات پرداخت → ثبت سفارش → صفحه موفقیت → تاریخچه سفارش‌ها
3. **Flow عضویت:** Register → اعتبارسنجی‌ها → ثبت موفق → Login
4. **Flow علاقه‌مندی:**Toggle کردن کتاب در Wishlist (نیاز به userId)

---

## 3. Business Flow و Business Rules به تفکیک ماژول

### 3.1 Login
**Flow:** ورود username + password (با امکان نمایش/مخفی کردن پسورد) → فراخوانی `POST /api/Login` → در صورت موفقیت دریافت JWT، انتقال سبد مهمان (`GET /api/ShoppingCart/SetShoppingCart/{oldUserId}/{newUserId}`)، نمایش نام کاربر در هدر.

**Business Rules (تأییدشده):**
- هر دو فیلد الزامی‌اند (`required` — ارسال خالی: فقط حاشیه قرمز، **بدون متن خطا**)
- ترکیب نادرست → پاسخ **HTTP 401** از API
- ⚠️ **یافته مهم QA:** در UI با credentials غلط **هیچ پیام خطایی به کاربر نمایش داده نمی‌شود** (فیلدها هم پاک نمی‌شوند) — feedback خاموش است.

### 3.2 Registration (`/register`)
**Flow:** پر کردن First/Last/User name + Password + Confirm Password + انتخاب Gender (رادیو Male/Female) → `POST /api/User` (با بررسی زنده تکراری‌نبودن username از طریق `GET /api/User/validateUserName/{userName}`).

**Business Rules (تأییدشده در UI و مطابق اسکیمای API):**
- همه فیلدها الزامی؛ Gender فقط `Male` یا `Female`
- **الگوی پسورد:** حداقل ۸ کاراکتر + حداقل ۱ حرف بزرگ + ۱ حرف کوچک + ۱ عدد
  - پیام UI: «Password should have minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter and 1 number»
- تأیید پسورد باید مطابق باشد — پیام UI: «Password do not match» ⚠️ (غلط املایی در خود محصول!)
- نام کاربری تکراری → پیام زنده «User Name is not available» (بدون submit)

### 3.3 Search
**Flow:** تایپ در جستجوی هدر + Enter → ناوبری به `/search?item={query}`، title صفحه به «Home | Search Books» تغییر می‌کند؛ جستجو روی **title و author** اعمال می‌شود.

**Business Rules / رفتارها:**
- query خالی → نمایش همه کتاب‌ها (لیست عادی)
- نتیجه خالی → پیام «No books found.» (این پیام هم برای «کاتالوگ خالی» و هم «جستجوی بی‌نتیجه» استفاده می‌شود ⚠️ — تمایز ندارد)
- نتایج با sidebar فیلتر (دسته‌بندی/قیمت) قابل ترکیب‌اند.

### 3.4 Product (Catalog & Book Details)
**Flow:** کارت کتاب (کاور، عنوان، نویسنده، قیمت ₹، آیکون wishlist، دکمه Add to Cart) → کلیک روی کارت → صفحه جزئیات (`/bookdetails/{id}`) با اطلاعات کامل + «کتاب‌های مشابه» (`GET /api/Book/GetSimilarBooks/{id}`).

**Business Rules (از اسکیمای API):** هر کتاب = `bookId, title, author, category, price, coverFileName`؛ فیلتر قیمت بر اساس min/max قیمت کاتالوگ مقداردهی می‌شود.

### 3.5 Cart (`/shopping-cart`)
**Flow:** افزودن از کارت/جزئیات (`POST /api/ShoppingCart/AddToCart/{userId}/{bookId}`) → افزایش badge هدر → در صفحه سبد: تغییر تعداد (`PUT`), حذف تک‌قلم (`DELETE /{userId}/{bookId}`), حذف کل سبد (`DELETE /{userId}`), نمایش جمع کل → دکمه Checkout.

**Business Rules:**
- سبد هر کاربر با `userId` (مهمان: عدد تصادفی در localStorage؛ کاربر واقعی: id حساب) کلید خورده است
- در لاگین، سبد مهمان به سبد کاربر **منتقل** می‌شود (نه حذف!)
- Checkout فقط با سبد غیرخالی معنا دارد.

### 3.6 Checkout (`/checkout`)
**Flow:** (نیاز به لاگین — Auth Guard) نمایش اقلام و جمع کل → فرم اطلاعات پرداخت (فرم کارت شبیه‌سازی‌شده — پول واقعی جابه‌جا نمی‌شود) → ثبت سفارش (`POST /api/CheckOut/{userId}`) → ساخت سفارش با `orderId` (GUID رشته‌ای) و `orderDate` → خالی شدن سبد → سفارش در تاریخچه (`GET /api/Order/{userId}`).

**Business Rules (از اسکیمای API):** بدنه Checkout = `orderDetails[]` (اقلام سبد) + `cartTotal` — یعنی جمع کل باید دقیقاً برابر Σ(قیمت × تعداد) اقلام باشد.

---

## 4. Test Caseهای پیشنهادی (Positive / Negative / Edge)

### Login
| نوع | سناریو | نتیجه مورد انتظار |
|---|---|---|
| Positive | ورود با credentials معتبر | هدر نام کاربر را نشان دهد، سبد مهمان merge شود |
| Negative | فیلدهای خالی + submit | فیلدهای required قرمز شوند، API فراخوانی نشود |
| Negative | پسورد نادرست | عدم ورود (فعلاً در UI خاموش است — توأمان یک باگ ثبت شود) |
| Edge | Username وجود دارد ولی پسورد غلط | همان رفتار 401 (نباید تفاوت کند — اطلاعات نگیرد) |
| Edge | Toggle نمایش پسورد | متن پسورد قابل مشاهده/مخفی شود |
| Edge | XSS در username | ورودی اجرا نشود |

### Registration
| نوع | سناریو | نتیجه مورد انتظار |
|---|---|---|
| Positive | ثبت‌نام با داده معتبر + username آزاد | حساب ساخته شود → هدایت به لاگین |
| Negative | پسورد ۷ کاراکتری / بدون عدد / بدون حرف بزرگ | پیام الگوی پسورد |
| Negative | Password ≠ Confirm | «Password do not match» |
| Negative | username تکراری (مثل `admin`) | «User Name is not available» به‌صورت زنده |
| Edge | فاصله (space) در فیلدها | رفتار مشخص (trim یا خطا) |
| Edge | username با کاراکتر خاص/طولانی | رفتار مشخص |

### Search
| نوع | سناریو | نتیجه مورد انتظار |
|---|---|---|
| Positive | جستجوی عنوان موجود | کارت‌های مرتبط در `/search?item=` |
| Positive | جستجوی نام نویسنده | نتیجه بر اساس author |
| Negative | عبارت بی‌معنی (`zzzzz`) | «No books found.» |
| Edge | query خالی + Enter | رفتار مشخص (لیست کامل یا بدون تغییر) |
| Edge | حروف بزرگ/کوچک (`HARRY`) | جستجو case-insensitive |
| Edge | query با فاصله و کاراکتر خاص | URL-encode صحیح |

### Product / Catalog
| نوع | سناریو | نتیجه مورد انتظار |
|---|---|---|
| Positive | نمایش لیست و انتخاب دسته‌بندی | فقط کتاب‌های آن دسته |
| Positive | فیلتر قیمت با اسلایدر | کتاب‌ها در بازه ₹ انتخابی |
| Positive | باز کردن جزئیات یک کتاب | عنوان/نویسنده/قیمت صحیح |
| Negative | `bookId` ناموجود در URL | رفتار کنترل‌شده (نه کرش) |
| Edge | ترکیب دسته + جستجو + فیلتر قیمت | فیلترها با هم جمع (AND) شوند |

### Cart
| نوع | سناریو | نتیجه مورد انتظار |
|---|---|---|
| Positive | افزودن کتاب از کارت | badge +۱، قلم در سبد |
| Positive | افزودن دوباره همان کتاب | افزایش تعداد (نه ردیف تکراری) |
| Positive | تغییر تعداد | جمع کل = Σ(price × qty) به‌روز شود |
| Positive | حذف تک‌قلم / خالی کردن سبد | به‌روزرسانی badge و جمع |
| Negative | سبد خالی → Checkout | مسدود یا پیام مناسب |
| Edge | افزودن در حالت مهمان، سپس لاگین | سبد مهمان از دست نرود (merge) |
| Edge | refresh صفحه / باز شدن در تب جدید | سبد persist شود (localStorage) |

### Checkout
| نوع | سناریو | نتیجه مورد انتظار |
|---|---|---|
| Positive | خرید کامل با کاربر لاگین‌شده | ثبت سفارش، orderId، سبد خالی شود |
| Negative | دسترسی مستقیم به `/checkout` بدون لاگین | ریدایرکت به `/login?returnUrl=%2Fcheckout` |
| Positive | پس از لاگین با returnUrl | بازگشت به checkout (نه خانه) |
| Negative | فیلدهای پرداخت نامعتبر (شماره کارت ناقص و...) | اعتبارسنجی فرم |
| Edge | جمع کل دقیقاً برابر سبد | محاسبه صحیح با تعداد >۱ |
| Edge | مشاهده سفارش در Order History | جزئیات و تاریخ سفارش صحیح |

---

## 5. Dependency بین قابلیت‌ها

```
Catalog (Book API) ──► Search ──► Book Details ──► Cart ──► Checkout ──► Order History
                                        │             ▲                    ▲
                                        └─ Wishlist   │                    │
Registration ──► Login ──────────────────────────────┘ (merge سبدها) ───────┘
```

نکات کلیدی برای طراحی تست:
- **همه تست‌های Checkout به Catalog و Cart و Login وابسته‌اند** → اگر Catalog بشکند (همان‌طور که الان شده!)، همه P0 های پایین‌دستی fail می‌شوند. بهتر است health-check سبک (smoke) جدا باشد.
- تست‌های Cart/Checkout به **داده پایدار** نیاز دارند (کتاب با id مشخص). چون API عمومی `POST /api/Book` (ساخت کتاب) دارد، در فاز بعد می‌توان با API call داده تستی ساخت (API Fixture) یا به idهای ثابت تکیه کرد.
- ثبت‌نام مستقل است → بهترین کاندیدا برای تست موازی/ایزوله.

---

## 6. چه چیزی ارزش Automation دارد و چه چیزی ندارد؟

**بله — اولویت Automation:**
- تمام Flowهای Transactional (Login/Register/Cart/Checkout) — پول و داده درگیر است، تکرار دستی پرهزینه
- Auth Guard و returnUrl — رگرسیون‌پذیر و سریع
- اعتبارسنجی فرم‌ها (قوانین مشخص و ثابت)
- محاسبات جمع کل سبد
- Smoke: بالا بودن سایت و سلامت Catalog API

**خیر — ارزش Automation پایین:**
- ظاهر و CSS (رنگ هدر، فونت) → تست دستی/Visual Tool
- نمایش ریسپانسیو موبایل → فعلاً خارج از Scope (بعداً با viewport testing)
- لینک‌های خارجی (GitHub) و محتوای Swagger
- Toast/انیمیشن‌های ظاهری گذرا — جز با assertion روی متن
- تست‌های Load/Performance — ابزار متفاوت می‌خواهد (k6 و...)

---

## 7. Critical User Journeys — اولویت‌بندی‌شده

| اولویت | Journey | دلیل |
|---|---|---|
| **P0-1** | ورود با حساب معتبر | دروازه همه Flowهای پرداختی |
| **P0-2** | خرید کامل: جستجو → جزئیات → افزودن به سبد → Checkout → ثبت سفارش | مسیر اصلی درآمد |
| **P0-3** | Auth Guard: دسترسی مستقیم به `/checkout` بدون لاگین | امنیت/دسترسی |
| **P1-1** | ثبت‌نام با اعتبارسنجی‌ها | ورود کاربر جدید |
| **P1-2** | جستجو + فیلتر دسته/قیمت | اصلی‌ترین مسیر کشف محصول |
| **P1-3** | مدیریت سبد (تعداد/حذف/جمع کل) | صحت مالی |
| **P1-4** | Merge سبد مهمان بعد از لاگین | رفتار کلیدی و ریسک‌دار |
| **P2-1** | Wishlist toggle | قابلیت فرعی |
| **P2-2** | Order History | ارزش اطمینان‌بخشی |
| **P2-3** | کتاب‌های مشابه در جزئیات | قابلیت discovery |

---

## 8. یافته‌های زنده (در لحظه تحلیل — مهم برای برنامه تست)

| # | یافته | وضعیت | تأثیر بر تست‌ها |
|---|---|---|---|
| 1 | `GET /api/Book` (لیست کاتالوگ) خطای **HTTP 500** می‌دهد | مشکل سمت سرور demo | لیست/جستجو/جزئیات/سبد فعلاً در GUI قابل تست نیستند |
| 2 | Cart API اقلام با `book: null` برمی‌گرداند (کتاب حذف‌شده) | data inconsistency | تست «حذف کتاب از کاتالوگ با سبد فعال» را پوشش دهید |
| 3 | صفحه Cart با چنین اقلامی **spinner بی‌پایان** دارد | باگ UI | سناریوی ورودی خراب را تست کنید |
| 4 | Login ناموفق **هیچ پیامی** به کاربر نمی‌دهد | باگ UX | assertion روی «عدم تغییر URL» بگذارید نه پیام خطا |
| 5 | «No books found.» هم برای خالی‌بودن است هم بی‌نتیجه‌بودن جستجو | طراحی ضعیف | assertion را محتاط بنویسید |

> ⚠️ **نتیجه عملی:** تا زمانی که کاتالوگ demo سایت برنگردد، تست‌های Catalog/Cart/Checkout قابل توسعه و اجرا نیستند. پیشنهاد: فاز بعد (Page Object Model) را شروع کنیم و تست‌ها را طوری بنویسیم که یک **health-check** در ابتدا وضعیت API را چک کند؛ وقتی سایت رفع ایراد شد، بقیه سابت‌ها فعال شوند.
