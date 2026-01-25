'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { getCityNames, getDistrictsForCity } from '@/lib/turkeyLocations';
import { useTranslation } from '@/i18n';

interface CityDistrictSelectorProps {
  city: string;
  district: string;
  onCityChange: (city: string) => void;
  onDistrictChange: (district: string) => void;
  cityPlaceholder?: string;
  districtPlaceholder?: string;
  className?: string;
}

export default function CityDistrictSelector({
  city,
  district,
  onCityChange,
  onDistrictChange,
  cityPlaceholder,
  districtPlaceholder,
  className = '',
}: CityDistrictSelectorProps) {
  const { t } = useTranslation();
  const [cityOpen, setCityOpen] = useState(false);
  const [districtOpen, setDistrictOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [districtSearch, setDistrictSearch] = useState('');
  
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const districtDropdownRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);

  const cities = getCityNames();
  const districts = city ? getDistrictsForCity(city) : [];

  // Debug: Log when city prop changes
  useEffect(() => {
    console.log('🔄 City prop changed to:', city);
  }, [city]);

  const filteredCities = citySearch.trim()
    ? cities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()))
    : cities;

  const filteredDistricts = districtSearch.trim()
    ? districts.filter(d => d.toLowerCase().includes(districtSearch.toLowerCase()))
    : districts;

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      console.log('📍 handleClickOutside triggered, isSelectingRef:', isSelectingRef.current);
      console.log('📍 event.target:', event.target);
      
      // Skip if we're in the middle of selecting
      if (isSelectingRef.current) {
        console.log('📍 Skipping close because isSelectingRef is true');
        isSelectingRef.current = false;
        return;
      }
      
      const cityContains = cityDropdownRef.current?.contains(event.target as Node);
      const districtContains = districtDropdownRef.current?.contains(event.target as Node);
      console.log('📍 cityDropdown contains target:', cityContains);
      console.log('📍 districtDropdown contains target:', districtContains);
      
      if (cityDropdownRef.current && !cityContains) {
        console.log('📍 Closing city dropdown');
        setCityOpen(false);
        setCitySearch('');
      }
      if (districtDropdownRef.current && !districtContains) {
        console.log('📍 Closing district dropdown');
        setDistrictOpen(false);
        setDistrictSearch('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectCity = useCallback((selectedCity: string) => {
    console.log('🏙️ selectCity called with:', selectedCity);
    console.log('🏙️ Current city before change:', city);
    isSelectingRef.current = true;
    onCityChange(selectedCity);
    onDistrictChange('');
    setCityOpen(false);
    setCitySearch('');
    console.log('🏙️ selectCity finished, cityOpen set to false');
  }, [onCityChange, onDistrictChange, city]);

  const selectDistrict = useCallback((selectedDistrict: string) => {
    console.log('🏘️ selectDistrict called with:', selectedDistrict);
    isSelectingRef.current = true;
    onDistrictChange(selectedDistrict);
    setDistrictOpen(false);
    setDistrictSearch('');
  }, [onDistrictChange]);

  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {/* City Dropdown */}
      <div ref={cityDropdownRef} className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCityOpen(!cityOpen);
            setDistrictOpen(false);
          }}
          className={`w-full px-4 py-3 text-left bg-white border rounded-xl flex items-center justify-between transition-all ${
            cityOpen ? 'border-orange-500 ring-2 ring-orange-100' : 'border-gray-200 hover:border-gray-300'
          } ${!city ? 'text-gray-400' : 'text-gray-900'}`}
        >
          <span className="truncate">{city || cityPlaceholder || t('common.selectCity')}</span>
          <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${cityOpen ? 'rotate-180' : ''}`} />
        </button>

        {cityOpen && (
          <div 
            className="absolute z-[9999] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden" 
            style={{ maxHeight: '280px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-gray-100 bg-white sticky top-0">
              <input
                type="text"
                value={citySearch}
                onChange={(e) => setCitySearch(e.target.value)}
                placeholder={t('common.searchCity')}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            <ul className="overflow-y-auto" style={{ maxHeight: '220px' }}>
              {filteredCities.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-500 text-center">{t('common.noResults')}</li>
              ) : (
                filteredCities.map((c) => (
                  <li
                    key={c}
                    onClick={(e) => {
                      console.log('🖱️ City item CLICK:', c);
                      e.preventDefault();
                      e.stopPropagation();
                      selectCity(c);
                    }}
                    onMouseDown={(e) => {
                      console.log('🖱️ City item MOUSEDOWN:', c);
                      e.stopPropagation();
                    }}
                    className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-orange-50 select-none ${
                      c === city ? 'bg-orange-100 text-orange-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {c}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {/* District Dropdown */}
      <div ref={districtDropdownRef} className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!city) {
              setCityOpen(true);
              return;
            }
            setDistrictOpen(!districtOpen);
            setCityOpen(false);
          }}
          disabled={!city}
          className={`w-full px-4 py-3 text-left bg-white border rounded-xl flex items-center justify-between transition-all ${
            districtOpen ? 'border-orange-500 ring-2 ring-orange-100' : 'border-gray-200 hover:border-gray-300'
          } ${!district ? 'text-gray-400' : 'text-gray-900'} ${!city ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="truncate">{district || districtPlaceholder || t('common.selectDistrict')}</span>
          <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${districtOpen ? 'rotate-180' : ''}`} />
        </button>

        {districtOpen && city && (
          <div 
            className="absolute z-[9999] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden" 
            style={{ maxHeight: '280px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-gray-100 bg-white sticky top-0">
              <input
                type="text"
                value={districtSearch}
                onChange={(e) => setDistrictSearch(e.target.value)}
                placeholder={t('common.searchDistrict')}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            <ul className="overflow-y-auto" style={{ maxHeight: '220px' }}>
              {filteredDistricts.length === 0 ? (
                <li className="px-4 py-3 text-sm text-gray-500 text-center">{t('common.noResults')}</li>
              ) : (
                filteredDistricts.map((d) => (
                  <li
                    key={d}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectDistrict(d);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-orange-50 select-none ${
                      d === district ? 'bg-orange-100 text-orange-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {d}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
