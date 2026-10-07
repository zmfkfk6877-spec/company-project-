import { randomBytes } from 'node:crypto';
const password=process.env.QUIZ_ADMIN_PASSWORD;
if(!password || password.length<12 || !/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password))throw Error('비밀번호는 12자 이상이며 영문, 숫자, 특수문자를 포함해야 합니다.');
if(/['\\\r\n]/.test(password))throw Error('설정 파일 생성을 위해 비밀번호에는 작은따옴표와 역슬래시를 사용하지 마세요.');
let url;try{url=new URL(process.env.QUIZ_PUBLIC_URL)}catch{throw Error('주소를 http:// 또는 https://로 시작하세요.')}
if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!/^[a-z0-9.-]+$/i.test(url.hostname))throw Error('IPv4 또는 내부 도메인의 접속 주소만 입력하세요. 예: http://10.20.30.40');
if(!/^[A-Za-z0-9_-]{3,60}$/.test(process.env.QUIZ_ADMIN_USERNAME))throw Error('관리자 아이디는 영문/숫자/_/- 3~60자입니다.');
const dbPassword=randomBytes(24).toString('hex');
const values={POSTGRES_USER:'phishingquiz',POSTGRES_PASSWORD:dbPassword,POSTGRES_DB:'phishingquiz',DATABASE_URL:`postgresql://phishingquiz:${dbPassword}@database:5432/phishingquiz`,SESSION_SECRET:randomBytes(32).toString('hex'),ENCRYPTION_KEY:randomBytes(32).toString('hex'),PUBLIC_URL:url.origin,COOKIE_SECURE:url.protocol==='https:'?'true':'false',TRUST_PROXY:'true',ADMIN_USERNAME:process.env.QUIZ_ADMIN_USERNAME,ADMIN_INITIAL_PASSWORD:password,ADMIN_ROLE:'SUPERADMIN',ADMIN_ALLOWED_IPS:'',UPLOAD_DIR:'/app/uploads'};
// Single quotes preserve $ and # in user-selected passwords without interpolation.
for(const [key,value] of Object.entries(values))console.log(`${key}='${value}'`);
