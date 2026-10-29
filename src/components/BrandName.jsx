import React from 'react';
import { useRestaurant } from '../context/RestaurantContext';

/**
 * The restaurant's name as a wordmark. Works with any name; an "&" (or "and" joiner)
 * gets the accent treatment when `ampClassName` is given.
 */
export default function BrandName({ className, ampClassName, upper = false, fallback = 'Restaurant' }) {
  const { name } = useRestaurant();
  const text = name || fallback;
  const display = upper ? text.toUpperCase() : text;

  if (!ampClassName || !display.includes('&')) return <span className={className}>{display}</span>;

  const [before, ...rest] = display.split('&');
  return (
    <span className={className}>
      {before}<span className={ampClassName}>&amp;</span>{rest.join('&')}
    </span>
  );
}
