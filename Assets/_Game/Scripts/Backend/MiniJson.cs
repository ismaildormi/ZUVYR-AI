using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace VELOX.Backend
{
    /// <summary>
    /// Minimal, allocation-conscious JSON reader used to parse Firebase
    /// Realtime Database responses (which are plain JSON objects/arrays).
    /// Keeping this dependency-free lets the secure read path work without
    /// pulling in a third-party JSON library.
    /// </summary>
    internal static class MiniJson
    {
        /// <summary>Parses a JSON document into a nested object graph.</summary>
        public static object Parse(string json)
        {
            if (string.IsNullOrEmpty(json) || json == "null") return null;
            int i = 0;
            object value = ParseValue(json, ref i);
            return value;
        }

        /// <summary>
        /// Converts a Realtime Database month node (a uid-keyed object) into a
        /// list of leaderboard entries.
        /// </summary>
        public static List<LeaderboardEntry> ToEntries(object node, string month)
        {
            var list = new List<LeaderboardEntry>();
            if (node is Dictionary<string, object> map)
            {
                foreach (KeyValuePair<string, object> kv in map)
                {
                    if (kv.Value is Dictionary<string, object> e)
                    {
                        list.Add(new LeaderboardEntry
                        {
                            id = AsString(e, "id") ?? kv.Key,
                            name = AsString(e, "name") ?? string.Empty,
                            score = AsInt(e, "score"),
                            month = AsString(e, "month") ?? month,
                            timestamp = AsLong(e, "timestamp")
                        });
                    }
                }
            }
            return list;
        }

        /// <summary>
        /// Converts a Realtime Database finalized-snapshot array (ranked entries)
        /// into a list of leaderboard entries, preserving order.
        /// </summary>
        public static List<LeaderboardEntry> ToEntryArray(object node)
        {
            var list = new List<LeaderboardEntry>();
            if (node is List<object> arr)
            {
                foreach (object item in arr)
                {
                    if (item is Dictionary<string, object> e)
                    {
                        list.Add(new LeaderboardEntry
                        {
                            id = AsString(e, "id") ?? string.Empty,
                            name = AsString(e, "name") ?? string.Empty,
                            score = AsInt(e, "score"),
                            month = AsString(e, "month") ?? string.Empty,
                            timestamp = AsLong(e, "timestamp")
                        });
                    }
                }
            }
            return list;
        }

        private static void SkipWs(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        private static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            if (i >= s.Length) throw new FormatException("Unexpected end of JSON.");
            char c = s[i];
            if (c == '{') return ParseObject(s, ref i);
            if (c == '[') return ParseArray(s, ref i);
            if (c == '"') return ParseString(s, ref i);
            if (c == 't' || c == 'f') return ParseBool(s, ref i);
            if (c == 'n') { i += 4; return null; }
            return ParseNumber(s, ref i);
        }

        private static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++; // '{'
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return d; }
            while (true)
            {
                SkipWs(s, ref i);
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                if (i >= s.Length || s[i] != ':') throw new FormatException("Expected ':' in object.");
                i++;
                d[key] = ParseValue(s, ref i);
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; return d; }
                throw new FormatException("Expected ',' or '}' in object.");
            }
        }

        private static List<object> ParseArray(string s, ref int i)
        {
            var a = new List<object>();
            i++; // '['
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return a; }
            while (true)
            {
                a.Add(ParseValue(s, ref i));
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; return a; }
                throw new FormatException("Expected ',' or ']' in array.");
            }
        }

        private static string ParseString(string s, ref int i)
        {
            if (i >= s.Length || s[i] != '"') throw new FormatException("Expected '\"'.");
            i++;
            var sb = new StringBuilder();
            while (i < s.Length && s[i] != '"')
            {
                char c = s[i];
                if (c == '\\')
                {
                    i++;
                    if (i >= s.Length) throw new FormatException("Bad escape.");
                    char e = s[i];
                    switch (e)
                    {
                        case 'n': sb.Append('\n'); break;
                        case 't': sb.Append('\t'); break;
                        case 'r': sb.Append('\r'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case '/': sb.Append('/'); break;
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case 'u':
                            {
                                if (i + 4 >= s.Length) throw new FormatException("Bad unicode escape.");
                                string hex = s.Substring(i + 1, 4);
                                sb.Append((char)int.Parse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                                i += 4;
                                break;
                            }
                        default: throw new FormatException("Bad escape: " + e);
                    }
                }
                else
                {
                    sb.Append(c);
                }
                i++;
            }
            if (i >= s.Length || s[i] != '"') throw new FormatException("Unterminated string.");
            i++;
            return sb.ToString();
        }

        private static bool ParseBool(string s, ref int i)
        {
            if (s[i] == 't') { i += 4; return true; }
            i += 5;
            return false;
        }

        private static double ParseNumber(string s, ref int i)
        {
            int start = i;
            while (i < s.Length &&
                   (char.IsDigit(s[i]) || s[i] == '-' || s[i] == '+' ||
                    s[i] == '.' || s[i] == 'e' || s[i] == 'E'))
                i++;
            return double.Parse(s.Substring(start, i - start), CultureInfo.InvariantCulture);
        }

        private static string AsString(Dictionary<string, object> o, string key) =>
            o.TryGetValue(key, out var v) ? v as string : null;

        private static int AsInt(Dictionary<string, object> o, string key) =>
            o.TryGetValue(key, out var v) && v is double d ? (int)d : 0;

        private static long AsLong(Dictionary<string, object> o, string key) =>
            o.TryGetValue(key, out var v) && v is double d ? (long)d : 0L;
    }
}
