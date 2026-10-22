# Filler: Color Fill — Supabase-Integration

## Was enthalten ist
- Anmeldung über Supabase Auth und Session-Prüfung auf Menü-, Kampagnen- und Spielseiten.
- Profile, Spielerfortschritt, Einstellungen und Kampagnenfortschritt mit Row Level Security.
- Automatisches Anlegen fehlender Profildaten bei neuen und bestehenden Auth-Benutzern.
- Intro-Abschluss über sichere RPC-Funktion.
- Kampagne mit Level-Freischaltung, Bestzügen, Bestscore und 0–3 Sternen.
- Serverseitige Zuglimit-/Freischaltungsprüfung, einmalige XP-Vergabe und Bestwert-Speicherung.
- Ein gemeinsames Level- und XP-Regelwerk zwischen Spiel und Datenbank.

## Einrichtung — bitte in dieser Reihenfolge
1. Entpacke das Projekt und öffne den Ordner `DOMIN8-final` in VS Code.
2. Öffne den Ordner mit einem lokalen Webserver (z. B. VS Code Live Server). Nicht per `file://` öffnen.
3. Öffne das richtige Projekt im Supabase Dashboard.
4. Kontrolliere `js/config.js`: `SUPABASE_URL` muss die Projekt-URL sein und `SUPABASE_KEY` ein **publishable/anon key**. Niemals den `service_role`-Key in den Browser schreiben.
5. Öffne Supabase → SQL Editor und führe **`supabase/complete-setup.sql`** vollständig aus. Die Datei ist wiederholbar angelegt, aber prüfe vor Änderungen an einer produktiven Datenbank zuerst vorhandene Tabellen und Policies.
6. In Supabase → Authentication → Providers muss Email aktiviert sein. Erstelle/teste einen Benutzer über Supabase Auth, falls noch keiner existiert.
7. Öffne `index.html` über Live Server und melde dich an. Die vorhandenen Benutzer werden beim SQL-Setup mit fehlenden Profil-/Fortschrittszeilen ergänzt.
8. Öffne die Kampagne, starte Level 1, schließe es ab und kontrolliere danach die Sterne sowie den Fortschritt in der Kampagne.

## Datenbank-Funktionen
- `complete_filler_intro()` speichert den Intro-Abschluss.
- `complete_campaign_level_with_stars(p_level_id, p_moves)` validiert Auth, Level-Freischaltung und Zuglimit, berechnet Sterne/Score serverseitig und vergibt XP nur beim ersten Abschluss.
- Direkte Client-Updates auf `player_progress` sind nicht erlaubt, damit XP nicht einfach über den Browser verändert werden können.
- RLS begrenzt lesbare Profildaten und Fortschritte auf den eingeloggten Nutzer.

## Sternregeln
- 3 Sterne: Züge ≤ 55 % des Zuglimits (aufgerundet).
- 2 Sterne: Züge ≤ 75 % des Zuglimits (aufgerundet).
- 1 Stern: Level im Zuglimit geschafft.
- 0 Sterne: noch nicht abgeschlossen.

## Wichtige Grenzen
Ich kann die Dateien und die Übereinstimmung von HTML/JavaScript/CSS prüfen, aber von hier aus nicht auf dein Supabase-Dashboard zugreifen und die Migration nicht in deiner Datenbank ausführen. Daher ist die Integration vorbereitet, aber erst nach erfolgreichem Ausführen der SQL-Datei und einem echten Test mit deinem Supabase-Projekt verifiziert.

Die RPC validiert Level-ID, Zuglimit und Freischaltung. Sie kann ohne serverseitige Prüfung des kompletten Spielfeldverlaufs nicht kryptografisch beweisen, dass der Browser das Rätsel ehrlich gelöst hat. Für ein öffentlich kompetitives Ranglisten-Spiel wäre ein serverseitiger Spielzug-/Board-Validator nötig.
