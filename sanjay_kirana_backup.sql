--
-- PostgreSQL database dump
--

\restrict gbjXgfJtFOvxaDBrgPAFcVbcTge0QkH9NG9HEuMSb6edhd7cXPoAGg2AJ2cygWt

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer NOT NULL,
    product_name character varying(255) NOT NULL,
    product_size character varying(100),
    product_image character varying(500),
    unit_price numeric(10,2) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    total_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_id character varying(64) NOT NULL,
    customer_name character varying(150) NOT NULL,
    customer_phone character varying(20) NOT NULL,
    delivery_address text NOT NULL,
    city character varying(100) NOT NULL,
    pincode character varying(20) NOT NULL,
    payment_method character varying(50) DEFAULT 'cod'::character varying NOT NULL,
    subtotal numeric(10,2) DEFAULT 0.00 NOT NULL,
    delivery_charge numeric(10,2) DEFAULT 0.00 NOT NULL,
    total_amount numeric(10,2) DEFAULT 0.00 NOT NULL,
    total_items integer DEFAULT 0 NOT NULL,
    status character varying(50) DEFAULT 'Order Placed'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    brand character varying(100),
    category character varying(100),
    sub_category character varying(100),
    size character varying(50),
    description text,
    price numeric(10,2) NOT NULL,
    original_price numeric(10,2),
    discount integer DEFAULT 0,
    stock integer DEFAULT 0,
    featured boolean DEFAULT false,
    bestseller boolean DEFAULT false,
    rating numeric(2,1) DEFAULT 0,
    total_reviews integer DEFAULT 0,
    image character varying(255)
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    phone character varying(15) NOT NULL,
    name character varying(150),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, product_id, product_name, product_size, product_image, unit_price, quantity, total_price, created_at) FROM stdin;
2	2	0	Ajay Quest Toothbrush	1pc	products/personal-care/ajay-quest-toothbrush.png	25.00	2	50.00	2026-08-25 23:58:20.906417+05:30
3	3	0	Ajay Quest Toothbrush	1pc	products/personal-care/ajay-quest-toothbrush.png	25.00	2	50.00	2026-08-25 23:58:39.644678+05:30
4	4	1	Colgate Strong Teeth	200g	products/personal-care/colgate.png	120.00	5	600.00	2026-08-25 23:58:39.950466+05:30
5	5	0	Ajay Quest Toothbrush	1pc	products/personal-care/ajay-quest-toothbrush.png	25.00	2	50.00	2026-08-26 00:20:08.460359+05:30
6	6	1	Colgate Strong Teeth	200g	products/personal-care/colgate.png	120.00	5	600.00	2026-08-26 00:20:08.704008+05:30
7	7	1006	Pampers Diapers	56 Pieces	products/baby-care/pampers-20.png	320.00	1	320.00	2026-08-26 00:20:56.802912+05:30
8	7	1005	Nestogen Stage 2	400g	products/baby-care/NEstogen.png	440.00	1	440.00	2026-08-26 00:20:56.802912+05:30
9	8	1	Colgate Strong Teeth	200g	products/personal-care/colgate.png	120.00	3	360.00	2026-08-26 00:22:14.22794+05:30
10	8	2	Closeup Ever Fresh	150g	products/personal-care/Closeup.png	110.00	2	220.00	2026-08-26 00:22:14.22794+05:30
11	9	0	Ajay Quest Toothbrush	1pc	products/personal-care/ajay-quest-toothbrush.png	25.00	2	50.00	2026-08-26 01:21:34.089067+05:30
12	10	1006	Pampers Diapers	56 Pieces	products/baby-care/pampers-20.png	320.00	2	640.00	2026-08-26 01:21:34.323853+05:30
13	11	0	Ajay Quest Toothbrush	1pc	products/personal-care/ajay-quest-toothbrush.png	25.00	2	50.00	2026-08-26 01:30:08.109455+05:30
14	12	1005	Nestogen Stage 2	400g	products/baby-care/NEstogen.png	440.00	2	880.00	2026-08-26 01:30:08.372472+05:30
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, order_id, customer_name, customer_phone, delivery_address, city, pincode, payment_method, subtotal, delivery_charge, total_amount, total_items, status, created_at, user_id) FROM stdin;
2	SK1787682500913389	Satyam Kasaudhan	9876543210	Main Road, Near Ramlila Ground	Harraiya	272155	cod	50.00	40.00	90.00	2	Order Placed	2026-08-25 23:58:20.906417+05:30	\N
3	SK1787682519649229	Satyam Kasaudhan	9876543210	Main Road, Near Ramlila Ground	Harraiya	272155	cod	50.00	40.00	90.00	2	Order Placed	2026-08-25 23:58:39.644678+05:30	\N
4	SK1787682519957190	Rajesh Kumar	9123456780	Station Road	Basti	272002	upi	600.00	0.00	600.00	5	Order Placed	2026-08-25 23:58:39.950466+05:30	\N
5	SK1787683808465459	Satyam Kasaudhan	9876543210	Main Road, Near Ramlila Ground	Harraiya	272155	cod	50.00	40.00	90.00	2	Order Placed	2026-08-26 00:20:08.460359+05:30	\N
6	SK1787683808709681	Rajesh Kumar	9123456780	Station Road	Basti	272002	upi	600.00	0.00	600.00	5	Order Placed	2026-08-26 00:20:08.704008+05:30	\N
7	SK1787683856833043	Satyam Kasaudhan	9554384886	2/275 A   Near RBRD Inter College Nawabganj	Kanpur	208002	cod	760.00	0.00	760.00	2	Order Placed	2026-08-26 00:20:56.802912+05:30	\N
8	SK1787683934238603	Satyam Kasaudhan	9554384886	2/275 A   Near RBRD Inter College Nawabganj	Kanpur	208002	upi	580.00	0.00	580.00	5	Order Placed	2026-08-26 00:22:14.22794+05:30	\N
9	SK1787687494093625	Satyam Kasaudhan	9876543210	Main Road, Near Ramlila Ground	Harraiya	272155	cod	50.00	40.00	90.00	2	Order Placed	2026-08-26 01:21:34.089067+05:30	\N
10	SK1787687494328936	Rajesh Kumar	9123456780	Station Road	Basti	272002	upi	640.00	0.00	640.00	2	Order Placed	2026-08-26 01:21:34.323853+05:30	\N
11	SK1787688008116818	Satyam Kasaudhan	9876543210	Main Road, Near Ramlila Ground	Harraiya	272155	cod	50.00	40.00	90.00	2	Order Placed	2026-08-26 01:30:08.109455+05:30	\N
12	SK1787688008378756	Rajesh Kumar	9123456780	Station Road	Basti	272002	upi	880.00	0.00	880.00	2	Order Placed	2026-08-26 01:30:08.372472+05:30	\N
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, name, brand, category, sub_category, size, description, price, original_price, discount, stock, featured, bestseller, rating, total_reviews, image) FROM stdin;
1	Colgate Strong Teeth	Colgate	Personal Care	Toothpaste	200g		120.00	135.00	11	37	t	t	4.6	245	products/personal-care/colgate.png
2	Closeup Ever Fresh	Closeup	Personal Care	Toothpaste	150g		110.00	120.00	8	38	t	t	4.5	180	products/personal-care/Closeup.png
1006	Pampers Diapers	Pampers	Baby Care	Diapers	56 Pieces		320.00	350.00	9	22	t	t	4.8	290	products/baby-care/pampers-20.png
0	Ajay Quest Toothbrush	Ajay	Personal Care	Toothbrush	1pc		25.00	30.00	17	40	f	f	4.5	120	products/personal-care/ajay-quest-toothbrush.png
1005	Nestogen Stage 2	Nestogen	Baby Care	Infant Formula	400g		440.00	470.00	6	15	f	f	4.7	82	products/baby-care/NEstogen.png
36	Zandu Balm	Zandu	Personal Care	Medicated Oil	25ml		120.00	125.00	4	35	f	f	4.6	140	products/personal-care/zandubalm.png
3	Dabur Lal Toothpaste	Dabur	Personal Care	Toothpaste	200g		95.00	100.00	5	35	f	f	4.4	120	products/personal-care/dabarlaltoothpaste.png
4	Dabur Lal Tail	Dabur	Personal Care	Hair Oil	200ml		180.00	200.00	10	25	f	f	4.7	95	products/personal-care/daburlaltel.png
5	Dant Kanti Toothpaste	Patanjali	Personal Care	Toothpaste	200g		105.00	120.00	12	40	f	f	4.5	160	products/personal-care/dantkanti.png
6	Dermicool Powder	Dermicool	Personal Care	Body Powder	100g		95.00	100.00	5	20	f	f	4.4	80	products/personal-care/dermicool.png
10	Garnier Facewash	Garnier	Personal Care	Facewash	100ml		220.00	260.00	15	25	t	f	4.7	210	products/personal-care/garnierfacewash.png
11	Glow & Lovely Cream	Glow & Lovely	Personal Care	Face Cream	50g		165.00	180.00	8	20	f	f	4.3	90	products/personal-care/glow&lovelycream.png
12	Himalaya Facewash	Himalaya	Personal Care	Facewash	100ml		180.00	200.00	10	30	t	f	4.7	175	products/personal-care/himalayafacewash.png
13	Lux Soap	Lux	Personal Care	Soap	150g		42.00	45.00	0	80	f	f	4.4	160	products/personal-care/lux.png
14	Navratna Hair Oil	Navratna	Personal Care	Hair Oil	200ml		165.00	180.00	10	30	t	f	4.7	130	products/personal-care/navratanoil.png
15	Navratna Red Oil	Navratna	Personal Care	Hair Oil	100ml		120.00	130.00	5	20	f	f	4.5	70	products/personal-care/navratanredoil.png
16	Nirma Soap	Nirma	Personal Care	Soap	150g		35.00	40.00	0	70	f	f	4.2	60	products/personal-care/Nirmasoap.png
17	Nycil Powder	Nycil	Personal Care	Body Powder	100g		120.00	135.00	10	25	f	f	4.6	100	products/personal-care/nycil.png
18	Patanjali Facewash	Patanjali	Personal Care	Facewash	100ml		110.00	120.00	8	30	f	f	4.4	95	products/personal-care/patanjalifacewaash.png
19	Pond's Facewash	Pond's	Personal Care	Facewash	100ml		170.00	190.00	10	25	t	f	4.6	150	products/personal-care/pondsfacwash.png
20	Santoor Soap	Santoor	Personal Care	Soap	150g		42.00	45.00	0	50	f	f	4.5	120	products/personal-care/santoor.png
21	Aloe Vera Gel	Patanjali	Personal Care	Face Cream	150ml		110.00	120.00	5	35	f	f	4.6	140	products/personal-care/aloevera.png
22	Sensodyne Toothpaste	Sensodyne	Personal Care	Toothpaste	200g		130.00	140.00	7	40	f	f	4.5	150	products/personal-care/sensodyne-toothpaste.png
23	Vicco Turmeric Cream	Vicco	Personal Care	Face Cream	100g		120.00	130.00	8	35	f	f	4.6	140	products/personal-care/vicco-turmeric.png
24	Ajay Sensitive Toothpaste	Ajay	Personal Care	Toothpaste	200g		115.00	125.00	8	40	f	f	4.5	130	products/personal-care/ajaySensitive.png
25	Boroline Antiseptic Cream	Boroline	Personal Care	Face Cream	50g		120.00	130.00	8	35	f	f	4.6	140	products/personal-care/boroline.png
26	Boroplus Antiseptic Cream	Boroplus	Personal Care	Face Cream	50g		120.00	130.00	8	35	f	f	4.6	140	products/personal-care/boroplus.png
27	Dabur Amla Hair Oil	Dabur	Personal Care	Hair Oil	200ml		165.00	180.00	10	30	t	f	4.7	130	products/personal-care/dabaramla.png
28	Figaro Olive Oil	Figaro	Personal Care	Hair Oil	200ml		165.00	180.00	10	30	t	f	4.7	130	products/personal-care/figarooil200ml.png
29	Gulabari Rose Water	Gulabari	Personal Care	Face Cream	100ml		120.00	130.00	8	35	f	f	4.6	140	products/personal-care/gulabarirosewater.png
30	Hamam Soap	Hamam	Personal Care	Soap	150g		35.00	40.00	0	70	f	f	4.2	60	products/personal-care/hamamsoap.png
31	Himgange Hair Oil	Himgange	Personal Care	Hair Oil	200ml		165.00	180.00	10	30	t	f	4.7	130	products/personal-care/himgangeoil.png
32	Jasmine Hair Oil	Jasmine	Personal Care	Hair Oil	200ml		165.00	180.00	10	30	t	f	4.7	130	products/personal-care/jasminehairoil.png
33	Pears Soap	Pears	Personal Care	Soap	150g		35.00	40.00	0	70	f	f	4.2	60	products/personal-care/pearssoap.png
34	Dove Soap	Dove	Personal Care	Soap	150g		35.00	40.00	0	70	f	f	4.2	60	products/personal-care/dovesoap.png
35	Rahat Rooh	Harbanshram	Personal Care	Medicated Oil	200ml		285.00	338.00	15	35	f	f	4.6	140	products/personal-care/rahatrooh.png
37	Streax Hair Color	Streax	Personal Care	Hair Color	200ml		165.00	180.00	10	30	t	f	4.7	130	products/personal-care/streaxhaircolor.png
101	Dettol Soap	Dettol	Home Care	Soap	125g		45.00	45.00	0	60	f	f	4.6	140	products/home-care/dettol.png
102	Dettol Antiseptic Liquid	Dettol	Home Care	Antiseptic Liquid	250ml		135.00	142.00	5	30	f	t	4.8	90	products/home-care/dettolAntisepticLiquid.png
103	Dettol Cool Soap	Dettol	Home Care	Soap	125g		48.00	48.00	0	40	f	f	4.5	100	products/home-care/dettolcool.png
104	Dettol Handwash	Dettol	Home Care	Handwash	200ml		90.00	95.00	5	50	t	t	4.7	120	products/home-care/dettol-handwash.png
113	Harpic Toilet Cleaner	Harpic	Home Care	Toilet Cleaner	500ml		110.00	120.00	8	35	t	t	4.8	220	products/home-care/harpic.png
105	Lifebuoy Soap	Lifebuoy	Home Care	Soap	125g		42.00	42.00	0	70	f	t	4.5	170	products/home-care/lifebuoy.png
106	Lizol Floor Cleaner	Lizol	Home Care	Floor Cleaner	500ml		165.00	180.00	8	25	t	t	4.7	160	products/home-care/lizol.png
107	Surf Excel Detergent Powder	Surf Excel	Home Care	Detergent Powder	1kg		235.00	250.00	6	30	t	t	4.8	310	products/home-care/surfexcel.png
108	Vim Dishwash Bar	Vim	Home Care	Dishwash Bar	250g		35.00	38.00	8	60	f	t	4.6	150	products/home-care/vimbar.png
109	Vim Dishwash Liquid	Vim	Home Care	Dishwash Liquid	500ml		120.00	130.00	8	40	f	f	4.7	130	products/home-care/vimliquid.png
110	Wheel Detergent Powder	Wheel	Home Care	Detergent Powder	1kg		85.00	90.00	6	45	f	t	4.4	120	products/home-care/wheel.png
111	Tide Detergent Powder	Tide	Home Care	Detergent Powder	1kg		250.00	260.00	4	30	t	t	4.8	310	products/home-care/tide.png
112	Comfort	Comfort	Home Care	Fabric Conditioner	430ml		100.00	125.00	20	30	t	t	4.8	310	products/home-care/comfort.png
1001	Johnson's Baby Oil	Johnson's	Baby Care	Baby Oil	200ml		185.00	200.00	8	30	t	t	4.8	320	products/baby-care/Johnsonsbabyoil.png
1002	Johnson's Baby Powder	Johnson's	Baby Care	Baby Powder	200g		160.00	170.00	6	35	t	t	4.8	280	products/baby-care/johnsonsbabypowder.png
1003	Johnson's Baby Soap	Johnson's	Baby Care	Baby Soap	125g		75.00	80.00	6	40	f	t	4.7	210	products/baby-care/Johnsonsbabysoap.png
1004	Nestogen Stage 1	Nestogen	Baby Care	Infant Formula	400g		420.00	450.00	7	20	t	f	4.7	95	products/baby-care/nestogen1.png
901	Nescafe Classic	Nescafe	Beverages	Coffee	50g		175.00	190.00	8	30	t	t	4.8	320	products/Beverages/nescafe.png
902	Nescafe Classic Jar	Nescafe	Beverages	Coffee	100g		350.00	380.00	8	20	t	t	4.8	240	products/Beverages/nescafejar.png
903	Taaza Tea	Taaza	Beverages	Tea	250g		150.00	160.00	6	40	f	t	4.6	180	products/Beverages/taazatea.png
904	Tata Agni Tea	Tata	Beverages	Tea	250g		170.00	180.00	6	35	t	t	4.7	210	products/Beverages/tataagni.png
905	Tata Tea Gold	Tata	Beverages	Tea	250g		190.00	205.00	7	30	t	t	4.8	260	products/Beverages/tatatea.png
601	Parle-G	Parle	Biscuits & Snacks	Biscuits	250g		25.00	25.00	0	100	t	t	4.8	450	products/biscuits-snacks/parleG.png
602	Parle-G Gold	Parle	Biscuits & Snacks	Biscuits	100g		20.00	20.00	0	80	f	t	4.7	280	products/biscuits-snacks/parlegold.png
603	Good Day Butter Cookies	Britannia	Biscuits & Snacks	Biscuits	200g		40.00	45.00	11	60	t	t	4.8	340	products/biscuits-snacks/goodday.png
604	Butter Bake	Britannia	Biscuits & Snacks	Biscuits	200g		35.00	40.00	13	55	f	f	4.5	160	products/biscuits-snacks/butterbake.png
605	Krack Jack	Parle	Biscuits & Snacks	Biscuits	200g		35.00	40.00	13	65	f	t	4.6	210	products/biscuits-snacks/krackjack.png
606	Monaco	Parle	Biscuits & Snacks	Biscuits	200g		35.00	40.00	13	60	f	t	4.7	230	products/biscuits-snacks/monaco.png
607	2 in 1 Biscuit	Parle	Biscuits & Snacks	Biscuits	150g		20.00	22.00	9	50	f	f	4.4	120	products/biscuits-snacks/2in1.png
608	Aloo Bhujia	Haldiram's	Biscuits & Snacks	Namkeen	200g		55.00	60.00	8	45	t	t	4.8	310	products/biscuits-snacks/aloobhujiya.png
609	Bhujiya	Haldiram's	Biscuits & Snacks	Namkeen	200g		55.00	60.00	8	45	f	t	4.7	260	products/biscuits-snacks/bhujiya.png
610	Navratan Mixture	Haldiram's	Biscuits & Snacks	Namkeen	200g		60.00	65.00	8	40	t	t	4.8	290	products/biscuits-snacks/haldiramnavratn.png
611	Khatta Meetha	Haldiram's	Biscuits & Snacks	Namkeen	200g		60.00	65.00	8	40	f	t	4.7	210	products/biscuits-snacks/khattameetha.png
612	Moong Dal Namkeen	Haldiram's	Biscuits & Snacks	Namkeen	200g		60.00	65.00	8	35	f	f	4.6	180	products/biscuits-snacks/moongnamkeen.png
613	Oreo	Monde	Biscuits & Snacks	Biscuits	50g		10.00	10.00	0	100	t	t	4.8	450	products/biscuits-snacks/oreo.png
501	Amul Milk	Amul	Dairy	Milk	500ml		30.00	30.00	0	100	t	t	4.9	520	products/Dairy/amul.png
701	Goldie 1-1 Noodles	Goldie	Instant Food	Instant Noodles	70g		15.00	15.00	0	60	t	f	4.3	90	products/instant-food/goldieoneone.png
702	Maggi 2-Minute Noodles	Maggi	Instant Food	Instant Noodles	70g		15.00	15.00	0	100	t	t	4.9	680	products/instant-food/maggi.png
703	Nourish Macaroni Pasta	Nourish	Instant Food	Pasta	200g		80.00	90.00	11	40	t	t	4.6	150	products/instant-food/nourish-macaroni-pasta.png
704	Nourish Poha	Nourish	Instant Food	Poha	200g		40.00	45.00	11	50	t	t	4.5	120	products/instant-food/nourish-poha.png
1101	Nutrela Soya Chunks	Nutrela	Nutrition	Soya Chunks	200g		70.00	75.00	7	40	t	t	4.8	240	products/Nutrition/nutrela.png
1102	Nutrela Soya Chunks	Nutrela	Nutrition	Soya Chunks	₹10 Pack		10.00	10.00	0	80	f	t	4.6	95	products/Nutrition/nutrela10.png
1103	Nutrela Mini Soya Chunks	Nutrela	Nutrition	Soya Chunks	₹10 Pack		10.00	10.00	0	80	f	f	4.6	85	products/Nutrition/nutrela10green.png
1104	Nutrela Mini Soya Chunks	Nutrela	Nutrition	Soya Chunks	200g		75.00	80.00	6	35	t	f	4.7	170	products/Nutrition/nutrelagreen.png
401	Bail Kolhu Mustard Oil	Bail Kolhu	Oil & Ghee	Mustard Oil	1L		190.00	200.00	5	30	t	t	4.8	180	products/oil-ghee/bailkohlu1L.png
402	Bail Kolhu Mustard Oil	Bail Kolhu	Oil & Ghee	Mustard Oil	2L		380.00	400.00	5	20	f	t	4.8	120	products/oil-ghee/bailkohlu2L.png
403	Bail Kolhu Mustard Oil	Bail Kolhu	Oil & Ghee	Mustard Oil	5L		920.00	960.00	4	12	t	t	4.9	95	products/oil-ghee/bailkohlu5L.png
404	Fortune Refined Oil	Fortune	Oil & Ghee	Refined Oil	1L		175.00	185.00	5	35	t	t	4.7	240	products/oil-ghee/fortune.png
405	Fortune Kachi Ghani Mustard Oil	Fortune	Oil & Ghee	Mustard Oil	1L		195.00	205.00	5	28	f	t	4.8	170	products/oil-ghee/fortunesarso.png
201	Aashirvaad Atta	Aashirvaad	Rice, Flour & Grains	Atta	5kg		285.00	300.00	5	25	t	t	4.8	420	products/rice-flour-grains/aashirvaad.png
202	Nourish Daliya	Nourish	Rice, Flour & Grains	Daliya	500g		55.00	60.00	8	40	f	t	4.6	110	products/rice-flour-grains/nourishdaliya.png
203	Nourish Suji	Nourish	Rice, Flour & Grains	Suji	500g		45.00	50.00	10	45	f	t	4.6	95	products/rice-flour-grains/nourishsuji.png
204	Nourish Atta	Nourish	Rice, Flour & Grains	Atta	5kg		285.00	300.00	5	25	t	t	4.8	420	products/rice-flour-grains/nourishaata.png
205	Nourish Arhar Dal	Nourish	Rice, Flour & Grains	Arhar Dal	500g		65.00	70.00	7	35	t	t	4.8	180	products/rice-flour-grains/nourisharhardal.png
301	Sugar	Loose	Salt & Sugar	Sugar	1kg		48.00	50.00	4	100	t	t	4.8	260	products/salt-sugar/sugar.png
302	Tata Salt	Tata	Salt & Sugar	Salt	1kg		30.00	32.00	6	80	t	t	4.9	450	products/salt-sugar/tatasalt.png
303	Tata Rock Salt	Tata	Salt & Sugar	Rock Salt	1kg		65.00	70.00	7	40	f	t	4.7	180	products/salt-sugar/tata-rock-salt.png
801	Goldie Garam Masala	Goldie	Spices & Masalas	Garam Masala	100g		60.00	65.00	8	40	t	t	4.7	180	products/spices-masalas/goldiegarammasala.png
802	Kitchen King Masala	MDH	Spices & Masalas	Kitchen King	100g		70.00	75.00	7	35	t	t	4.8	220	products/spices-masalas/kitchenking.png
803	MDH Chaat Masala	MDH	Spices & Masalas	Chaat Masala	100g		65.00	70.00	7	40	f	t	4.7	170	products/spices-masalas/mdh-chaat-masala.png
804	MDH Deggi Mirch	MDH	Spices & Masalas	Red Chilli Powder	100g		85.00	90.00	6	30	f	t	4.8	210	products/spices-masalas/mdh-deggi-mirch.png
805	MDH Chana Masala	MDH	Spices & Masalas	Chana Masala	100g		70.00	75.00	7	35	f	t	4.7	150	products/spices-masalas/mdhchanamasala.png
806	MDH Chicken Masala	MDH	Spices & Masalas	Chicken Masala	100g		75.00	80.00	6	25	f	f	4.6	120	products/spices-masalas/mdhchicken.png
807	MDH Deggi Mirch Powder	MDH	Spices & Masalas	Red Chilli Powder	100g		80.00	85.00	6	30	f	t	4.7	165	products/spices-masalas/mdhdeggi.png
808	MDH Garam Masala	MDH	Spices & Masalas	Garam Masala	100g		70.00	75.00	7	40	t	t	4.8	240	products/spices-masalas/mdhgaram.png
809	MDH Meat Masala	MDH	Spices & Masalas	Meat Masala	100g		80.00	85.00	6	25	f	f	4.6	110	products/spices-masalas/mdhmeet.png
810	Meat Masala	Everest	Spices & Masalas	Meat Masala	100g		80.00	85.00	6	20	f	f	4.5	90	products/spices-masalas/meatmasala.png
811	Rayta Masala	MDH	Spices & Masalas	Rayta Masala	100g		60.00	65.00	8	35	f	f	4.6	100	products/spices-masalas/rayatmasala.png
812	Sabji Masala	MDH	Spices & Masalas	Sabji Masala	100g		65.00	70.00	7	35	t	t	4.7	180	products/spices-masalas/sabjimasala.png
813	Chhole Masala	MDH	Spices & Masalas	Chhole Masala	100g		70.00	75.00	7	30	f	t	4.7	160	products/spices-masalas/chholemasale.png
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, phone, name, created_at) FROM stdin;
1	9876543210	\N	2026-08-26 21:14:08.068661+05:30
\.


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_items_id_seq', 14, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 12, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_id_key UNIQUE (order_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_order_id ON public.orders USING btree (order_id);


--
-- Name: idx_orders_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict gbjXgfJtFOvxaDBrgPAFcVbcTge0QkH9NG9HEuMSb6edhd7cXPoAGg2AJ2cygWt

