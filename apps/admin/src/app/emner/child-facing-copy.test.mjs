import assert from "node:assert/strict";
import test from "node:test";

import {
  CHILD_FACING_COPY_ERROR,
  getChildFacingCopyError,
} from "./child-facing-copy.ts";

test("accepts direct child-facing copy without requiring the word du", () => {
  for (const value of [
    "Leg med bolden og lær en ny finte.",
    "Du kan tage de blå sko på.",
    "Få hjælp af en voksen, hvis du har brug for det.",
    "Spørg dine forældre om hjælp.",
    "Leg med andre børn og skiftes til bolden.",
    "",
  ]) {
    assert.equal(getChildFacingCopyError(value), null, value);
  }
});

test("rejects clear parent- and narrator-facing phrases", () => {
  for (const value of [
    "Barnet lærer at holde balancen.",
    "Giv barnet plads til at øve sig.",
    "Hjælp dit barn med at finde bolden.",
    "Her kan jeres\nbarn træne sikkert.",
    "Børnenes opgave er at gennemføre banen.",
    "Børn kan øve sig med bolden.",
    "Barn løber gennem banen.",
    "Børn dribler med bolden.",
    "Forældre skal holde fast i bolden.",
    "Forældre hjælper med øvelsen.",
    "Forældre kan vælge næste øvelse.",
    "Som forælder kan du stille keglerne frem.",
    "Kære forældre, find en bold sammen.",
    "Denne besked er til forældrene.",
    "Forælderen bør hjælpe med banen.",
  ]) {
    assert.equal(
      getChildFacingCopyError(value),
      CHILD_FACING_COPY_ERROR,
      value,
    );
  }
});
