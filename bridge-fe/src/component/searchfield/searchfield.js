import { SearchIcon } from '@/assets'
import React from 'react'
import { useTheme } from '@/theme/ThemeProvider';

export default function SearchField({ value, onChange }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className='relative my-2'>
      <input value={value} onChange={onChange} type='text' className={`${theme === "light" ? "bg-white text-black border-lightbg" : "bg-smooth text-white border-gray-500"
        } w-full rounded-md outline-none border py-2 pl-9 pr-2`} placeholder='Search' />
      <span className={` ${theme === "light" ? "light-search" : ""
        } absolute top-[11px] left-[10px]`}>
        <SearchIcon />
      </span>
    </div>
  )
}
