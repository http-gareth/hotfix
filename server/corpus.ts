export type Test = [string, unknown]
export type Snippet = { name: string, source: string, tests: Test[] }

const code = (lines: string[]) => lines.join('\n')

export const CORPUS: Snippet[] = [
  {
    name: 'chunk',
    source: code([
      'function chunk(items, size) {',
      '  const groups = []',
      '  for (let i = 0; i < items.length; i += size) {',
      '    groups.push(items.slice(i, i + size))',
      '  }',
      '  return groups',
      '}'
    ]),
    tests: [['chunk([1, 2, 3, 4], 2)', [[1, 2], [3, 4]]], ['chunk([1, 2, 3], 2)', [[1, 2], [3]]], ['chunk([], 3)', []]]
  },
  {
    name: 'range',
    source: code([
      'function range(start, end, step = 1) {',
      '  const numbers = []',
      '  for (let n = start; n < end; n += step) numbers.push(n)',
      '  return numbers',
      '}'
    ]),
    tests: [['range(0, 4)', [0, 1, 2, 3]], ['range(2, 10, 3)', [2, 5, 8]], ['range(5, 5)', []]]
  },
  {
    name: 'last',
    source: code([
      'function last(items) {',
      '  return items[items.length - 1]',
      '}'
    ]),
    tests: [['last([1, 2, 3])', 3], ["last(['a'])", 'a']]
  },
  {
    name: 'sum',
    source: code([
      'function sum(numbers) {',
      '  let total = 0',
      '  for (const n of numbers) total += n',
      '  return total',
      '}'
    ]),
    tests: [['sum([1, 2, 3])', 6], ['sum([])', 0], ['sum([-4, 4])', 0]]
  },
  {
    name: 'average',
    source: code([
      'function average(numbers) {',
      '  if (numbers.length === 0) return 0',
      '  return numbers.reduce((total, n) => total + n, 0) / numbers.length',
      '}'
    ]),
    tests: [['average([2, 4, 6])', 4], ['average([])', 0], ['average([5])', 5]]
  },
  {
    name: 'isPalindrome',
    source: code([
      'function isPalindrome(word) {',
      '  const letters = word.toLowerCase()',
      '  for (let i = 0; i < letters.length / 2; i++) {',
      '    if (letters[i] !== letters[letters.length - 1 - i]) return false',
      '  }',
      '  return true',
      '}'
    ]),
    tests: [["isPalindrome('Racecar')", true], ["isPalindrome('hello')", false], ["isPalindrome('ab')", false], ["isPalindrome('')", true]]
  },
  {
    name: 'capitalize',
    source: code([
      'function capitalize(text) {',
      '  return text.charAt(0).toUpperCase() + text.slice(1)',
      '}'
    ]),
    tests: [["capitalize('hello')", 'Hello'], ["capitalize('a')", 'A']]
  },
  {
    name: 'countVowels',
    source: code([
      'function countVowels(text) {',
      '  let count = 0',
      '  for (const letter of text.toLowerCase()) {',
      "    if ('aeiou'.includes(letter)) count++",
      '  }',
      '  return count',
      '}'
    ]),
    tests: [["countVowels('Hello World')", 3], ["countVowels('xyz')", 0]]
  },
  {
    name: 'largest',
    source: code([
      'function largest(numbers) {',
      '  let best = numbers[0]',
      '  for (let i = 1; i < numbers.length; i++) {',
      '    if (numbers[i] > best) best = numbers[i]',
      '  }',
      '  return best',
      '}'
    ]),
    tests: [['largest([3, 9, 2])', 9], ['largest([-5, -2, -9])', -2], ['largest([7])', 7]]
  },
  {
    name: 'isLeapYear',
    source: code([
      'function isLeapYear(year) {',
      '  if (year % 400 === 0) return true',
      '  if (year % 100 === 0) return false',
      '  return year % 4 === 0',
      '}'
    ]),
    tests: [['isLeapYear(2024)', true], ['isLeapYear(1900)', false], ['isLeapYear(2000)', true], ['isLeapYear(2023)', false]]
  },
  {
    name: 'canCheckout',
    source: code([
      'function canCheckout(cart, user) {',
      '  if (cart.items.length === 0) return false',
      '  if (!user.signedIn) return false',
      '  return cart.total > 0 && user.verified',
      '}'
    ]),
    tests: [
      ['canCheckout({ items: [1], total: 50 }, { signedIn: true, verified: true })', true],
      ['canCheckout({ items: [1], total: 50 }, { signedIn: true, verified: false })', false],
      ['canCheckout({ items: [], total: 0 }, { signedIn: true, verified: true })', false],
      ['canCheckout({ items: [1], total: 50 }, { signedIn: false, verified: true })', false]
    ]
  },
  {
    name: 'isAdult',
    source: code([
      'function isAdult(age) {',
      '  return age >= 18',
      '}'
    ]),
    tests: [['isAdult(18)', true], ['isAdult(17)', false], ['isAdult(40)', true]]
  },
  {
    name: 'truncate',
    source: code([
      'function truncate(text, max) {',
      '  if (text.length <= max) return text',
      "  return text.slice(0, max - 1) + '…'",
      '}'
    ]),
    tests: [["truncate('hello', 10)", 'hello'], ["truncate('hello world', 5)", 'hell…'], ["truncate('hello', 5)", 'hello']]
  },
  {
    name: 'binarySearch',
    source: code([
      'function binarySearch(sorted, target) {',
      '  let low = 0',
      '  let high = sorted.length - 1',
      '  while (low <= high) {',
      '    const middle = Math.floor((low + high) / 2)',
      '    if (sorted[middle] === target) return middle',
      '    if (sorted[middle] < target) low = middle + 1',
      '    else high = middle - 1',
      '  }',
      '  return -1',
      '}'
    ]),
    tests: [
      ['binarySearch([1, 3, 5, 7, 9], 7)', 3], ['binarySearch([1, 3, 5, 7, 9], 1)', 0],
      ['binarySearch([1, 3, 5, 7, 9], 9)', 4], ['binarySearch([1, 3, 5, 7, 9], 4)', -1], ['binarySearch([], 1)', -1]
    ]
  },
  {
    name: 'fizzBuzz',
    source: code([
      'function fizzBuzz(n) {',
      "  if (n % 15 === 0) return 'FizzBuzz'",
      "  if (n % 3 === 0) return 'Fizz'",
      "  if (n % 5 === 0) return 'Buzz'",
      '  return String(n)',
      '}'
    ]),
    tests: [['fizzBuzz(15)', 'FizzBuzz'], ['fizzBuzz(9)', 'Fizz'], ['fizzBuzz(10)', 'Buzz'], ['fizzBuzz(7)', '7']]
  },
  {
    name: 'unique',
    source: code([
      'function unique(items) {',
      '  const seen = new Set()',
      '  return items.filter(item => {',
      '    if (seen.has(item)) return false',
      '    seen.add(item)',
      '    return true',
      '  })',
      '}'
    ]),
    tests: [['unique([1, 2, 2, 3, 1])', [1, 2, 3]], ['unique([])', []]]
  },
  {
    name: 'formatPrice',
    source: code([
      'function formatPrice(cents) {',
      '  const rands = Math.floor(cents / 100)',
      '  const rest = cents % 100',
      "  return 'R' + rands + '.' + String(rest).padStart(2, '0')",
      '}'
    ]),
    tests: [['formatPrice(1999)', 'R19.99'], ['formatPrice(500)', 'R5.00'], ['formatPrice(7)', 'R0.07']]
  },
  {
    name: 'countdown',
    source: code([
      'function countdown(from) {',
      '  const steps = []',
      '  for (let n = from; n > 0; n--) steps.push(n)',
      "  return [...steps, 'Liftoff!']",
      '}'
    ]),
    tests: [['countdown(3)', [3, 2, 1, 'Liftoff!']], ['countdown(0)', ['Liftoff!']]]
  },
  {
    name: 'isEven',
    source: code([
      'function isEven(n) {',
      '  return n % 2 === 0',
      '}'
    ]),
    tests: [['isEven(4)', true], ['isEven(7)', false], ['isEven(0)', true]]
  },
  {
    name: 'canVote',
    source: code([
      'function canVote(age, registered) {',
      '  return age >= 18 && registered',
      '}'
    ]),
    tests: [['canVote(18, true)', true], ['canVote(17, true)', false], ['canVote(30, false)', false]]
  },
  {
    name: 'inRange',
    source: code([
      'function inRange(n, low, high) {',
      '  return n >= low && n <= high',
      '}'
    ]),
    tests: [['inRange(5, 5, 10)', true], ['inRange(10, 5, 10)', true], ['inRange(11, 5, 10)', false], ['inRange(4, 5, 10)', false]]
  },
  {
    name: 'grade',
    source: code([
      'function grade(score) {',
      "  if (score >= 90) return 'A'",
      "  if (score >= 80) return 'B'",
      "  if (score >= 70) return 'C'",
      "  return 'F'",
      '}'
    ]),
    tests: [['grade(90)', 'A'], ['grade(89)', 'B'], ['grade(80)', 'B'], ['grade(79)', 'C'], ['grade(70)', 'C'], ['grade(69)', 'F']]
  },
  {
    name: 'discount',
    source: code([
      'function discount(total, member) {',
      '  if (member && total >= 100) return total * 0.9',
      '  return total',
      '}'
    ]),
    tests: [['discount(100, true)', 90], ['discount(99, true)', 99], ['discount(100, false)', 100], ['discount(200, true)', 180]]
  },
  {
    name: 'sign',
    source: code([
      'function sign(n) {',
      '  if (n > 0) return 1',
      '  if (n < 0) return -1',
      '  return 0',
      '}'
    ]),
    tests: [['sign(5)', 1], ['sign(1)', 1], ['sign(-5)', -1], ['sign(0)', 0]]
  },
  {
    name: 'isWeekend',
    source: code([
      'function isWeekend(day) {',
      "  return day === 'Sat' || day === 'Sun'",
      '}'
    ]),
    tests: [["isWeekend('Sat')", true], ["isWeekend('Sun')", true], ["isWeekend('Mon')", false]]
  },
  {
    name: 'strongPassword',
    source: code([
      'function strongPassword(password) {',
      '  const long = password.length >= 8',
      '  const mixed = password !== password.toLowerCase()',
      '  return long && mixed',
      '}'
    ]),
    tests: [["strongPassword('Secret123')", true], ["strongPassword('secret123')", false], ["strongPassword('Short1A')", false], ["strongPassword('ABCDEFGH')", true]]
  },
  {
    name: 'median',
    source: code([
      'function median(numbers) {',
      '  const sorted = [...numbers].sort((a, b) => a - b)',
      '  const middle = Math.floor(sorted.length / 2)',
      '  if (sorted.length % 2) return sorted[middle]',
      '  return (sorted[middle - 1] + sorted[middle]) / 2',
      '}'
    ]),
    tests: [['median([3, 1, 2])', 2], ['median([4, 1, 3, 2])', 2.5], ['median([10, 2, 38, 23, 38, 23, 21])', 23]]
  },
  {
    name: 'factorial',
    source: code([
      'function factorial(n) {',
      '  let result = 1',
      '  for (let i = 2; i <= n; i++) result *= i',
      '  return result',
      '}'
    ]),
    tests: [['factorial(0)', 1], ['factorial(1)', 1], ['factorial(5)', 120]]
  },
  {
    name: 'sumOdd',
    source: code([
      'function sumOdd(numbers) {',
      '  let total = 0',
      '  for (const n of numbers) if (n % 2 === 1) total += n',
      '  return total',
      '}'
    ]),
    tests: [['sumOdd([1, 2, 3, 4, 5])', 9], ['sumOdd([])', 0], ['sumOdd([2, 4])', 0]]
  },
  {
    name: 'initials',
    source: code([
      'function initials(name) {',
      "  const words = name.split(' ')",
      "  return words.map(word => word[0]).join('').toUpperCase()",
      '}'
    ]),
    tests: [["initials('ada lovelace')", 'AL'], ["initials('grace brewster hopper')", 'GBH']]
  },
  {
    name: 'daysInMonth',
    source: code([
      'function daysInMonth(month, leap) {',
      '  if (month === 2) return leap ? 29 : 28',
      '  return [4, 6, 9, 11].includes(month) ? 30 : 31',
      '}'
    ]),
    tests: [
      ['daysInMonth(2, true)', 29], ['daysInMonth(2, false)', 28], ['daysInMonth(1, false)', 31], ['daysInMonth(3, false)', 31],
      ['daysInMonth(4, false)', 30], ['daysInMonth(5, false)', 31], ['daysInMonth(6, false)', 30], ['daysInMonth(9, false)', 30],
      ['daysInMonth(10, false)', 31], ['daysInMonth(11, false)', 30], ['daysInMonth(12, false)', 31]
    ]
  },
  {
    name: 'shipping',
    source: code([
      'function shipping(kilograms) {',
      '  if (kilograms <= 1) return 5',
      '  if (kilograms <= 5) return 10',
      '  return 10 + (kilograms - 5) * 2',
      '}'
    ]),
    tests: [['shipping(1)', 5], ['shipping(2)', 10], ['shipping(5)', 10], ['shipping(6)', 12], ['shipping(8)', 16]]
  },
  {
    name: 'isTriangle',
    source: code([
      'function isTriangle(a, b, c) {',
      '  return a + b > c && a + c > b && b + c > a',
      '}'
    ]),
    tests: [['isTriangle(3, 4, 5)', true], ['isTriangle(1, 2, 3)', false], ['isTriangle(1, 3, 2)', false], ['isTriangle(3, 1, 2)', false]]
  },
  {
    name: 'level',
    source: code([
      'function level(xp) {',
      '  return Math.floor(xp / 100) + 1',
      '}'
    ]),
    tests: [['level(0)', 1], ['level(99)', 1], ['level(100)', 2], ['level(250)', 3]]
  },
  {
    name: 'clock',
    source: code([
      'function clock(seconds) {',
      '  const minutes = Math.floor(seconds / 60)',
      '  const rest = seconds % 60',
      "  return minutes + ':' + String(rest).padStart(2, '0')",
      '}'
    ]),
    tests: [['clock(125)', '2:05'], ['clock(59)', '0:59'], ['clock(60)', '1:00']]
  },
  {
    name: 'compact',
    source: code([
      'function compact(items) {',
      '  return items.filter(item => item !== null && item !== undefined)',
      '}'
    ]),
    tests: [['compact([1, null, 2, undefined, 0])', [1, 2, 0]], ['compact([])', []]]
  },
  {
    name: 'wordCount',
    source: code([
      'function wordCount(text) {',
      "  if (text.trim() === '') return 0",
      "  return text.trim().split(' ').length",
      '}'
    ]),
    tests: [["wordCount('')", 0], ["wordCount('hi there')", 2], ["wordCount('  one ')", 1]]
  },
  {
    name: 'bestStreak',
    source: code([
      'function bestStreak(results) {',
      '  let best = 0',
      '  let run = 0',
      '  for (const won of results) {',
      '    run = won ? run + 1 : 0',
      '    if (run > best) best = run',
      '  }',
      '  return best',
      '}'
    ]),
    tests: [['bestStreak([true, true, false, true])', 2], ['bestStreak([])', 0], ['bestStreak([false])', 0], ['bestStreak([true, true, true])', 3]]
  },
  {
    name: 'isPrime',
    source: code([
      'function isPrime(n) {',
      '  if (n < 2) return false',
      '  for (let i = 2; i * i <= n; i++) {',
      '    if (n % i === 0) return false',
      '  }',
      '  return true',
      '}'
    ]),
    tests: [['isPrime(1)', false], ['isPrime(2)', true], ['isPrime(4)', false], ['isPrime(9)', false], ['isPrime(13)', true], ['isPrime(25)', false]]
  },
  {
    name: 'trafficLight',
    source: code([
      'function trafficLight(color) {',
      "  if (color === 'green') return 'go'",
      "  if (color === 'amber') return 'slow down'",
      "  return 'stop'",
      '}'
    ]),
    tests: [["trafficLight('green')", 'go'], ["trafficLight('amber')", 'slow down'], ["trafficLight('red')", 'stop']]
  },
  {
    name: 'canAfford',
    source: code([
      'function canAfford(balance, price, fee) {',
      '  return balance - fee >= price',
      '}'
    ]),
    tests: [['canAfford(100, 90, 10)', true], ['canAfford(100, 91, 10)', false], ['canAfford(50, 60, 0)', false]]
  },
  {
    name: 'livesLeft',
    source: code([
      'function livesLeft(hits) {',
      '  return Math.max(0, 3 - hits)',
      '}'
    ]),
    tests: [['livesLeft(0)', 3], ['livesLeft(2)', 1], ['livesLeft(3)', 0], ['livesLeft(5)', 0]]
  },
  {
    name: 'needsLogin',
    source: code([
      'function needsLogin(page, user) {',
      '  if (page.public) return false',
      '  return !user',
      '}'
    ]),
    tests: [['needsLogin({ public: true }, null)', false], ['needsLogin({ public: false }, null)', true], ["needsLogin({ public: false }, { name: 'Ada' })", false]]
  },
  {
    name: 'canMove',
    source: code([
      'function canMove(x, y, size) {',
      '  return x >= 0 && y >= 0 && x < size && y < size',
      '}'
    ]),
    tests: [
      ['canMove(0, 0, 3)', true], ['canMove(2, 2, 3)', true], ['canMove(3, 0, 3)', false],
      ['canMove(0, 3, 3)', false], ['canMove(-1, 0, 3)', false], ['canMove(0, -1, 3)', false]
    ]
  }
]
